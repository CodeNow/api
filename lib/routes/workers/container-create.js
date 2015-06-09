/**
 * Internal route for job queue system, respond to
 * container create event
 * POST /workers/container-create
 * @module lib/routes/workers/container-create
 */
'use strict';

var express = require('express');
var flow = require('middleware-flow');
var mw = require('dat-middleware');

var isInternalRequest = require('middlewares/is-internal-request');
var runnable = require('middlewarize')(require('models/apis/runnable'));
var user = require('mongooseware')(require('models/mongo/user'));
var validations = require('middlewares/validations');

var app = module.exports = express();

var containerCreateValidationFlow = flow.series(
  mw.body('id').require(), //TODO HEX validation
  mw.body('host').require(),
  mw.body('inspectData.Config.Labels.ownerUsername').require(),
  //  mw.body('inspectData').require(),
  //  TODO handle docker inspect fail either here or in docker-listener
  mw.body('inspectData.Config.Labels.instanceId',
          'inspectData.Config.Labels.contextVersionId').require().validate(validations.isObjectId)
);

/**
 * Internal route, invoked from worker in response
 * to docker-listener detecting a container-create
 * event and creating a job in a rabbitmq queue
 */
app.post('/workers/container-create',
  isInternalRequest,
  containerCreateValidationFlow,
  mw.req().set('contextVersionId', 'body.inspectData.Config.Labels.contextVersionId'),
  mw.req().set('dockerContainer', 'body.id'),
  mw.req().set('instanceId', 'body.inspectData.Config.Labels.instanceId'),
  mw.req().set('instanceShortHash', 'body.inspectData.Config.Labels.instanceShortHash'),
  mw.req().set('creatorGithubId', 'body.inspectData.Config.Labels.creatorGithubId'),
  user.findByGithubId('creatorGithubId').exec('sessionUser'),
  mw.req('sessionUser._id').require(),
  runnable.new({}, 'sessionUser'),
  // update instance model with container
  function instancePatchBodySetup (req, res, next) {
    req.updateOpts = {
      json: {
        container: {
          dockerContainer: req.body.id, // docker container id
          dockerHost: req.body.host, // dock
          inspect: req.body.inspectData,
          ports: req.body.inspectData.NetworkSettings.Ports
        }
      },
      query: {
        '_id': req.instanceId,
        'contextVersion._id': req.contextVersionId
      }
    };
    next();
  },
  runnable.model.updateInstance('instanceShortHash', 'updateOpts', 'cb').async('instance'),
  runnable.model.startInstance('instanceShortHash', 'cb').async(),
  // still thinking about this...
  mw.res.json(200, {})
);
