/**
 * Internal route for job queue system, respond to
 * container create event
 * POST /workers/on-instance-container-create
 * @module lib/routes/workers/on-instance-container-create
 */
'use strict';

var express = require('express');
var flow = require('middleware-flow');
var mw = require('dat-middleware');

var isInternalRequest = require('middlewares/is-internal-request');
var logger = require('middlewares/logger')(__filename);
var requestTrace = require('middlewares/request-trace');
var runnable = require('middlewarize')(require('models/apis/runnable'));
var user = require('mongooseware')(require('models/mongo/user'));
var validations = require('middlewares/validations');

var app = module.exports = express();

var containerCreateValidationFlow = flow.series(
  mw.body('id').require(), //TODO HEX validation
  mw.body('host').require(),
  //  mw.body('inspectData').require(),
  //  TODO handle docker inspect fail either here or in docker-listener
  mw.body('inspectData.Config.Labels.instanceId',
          'inspectData.Config.Labels.contextVersionId').require().validate(validations.isObjectId)
);

// keypaths on req logged at multiple points in route middleware flow
var reqLogKeypaths = [
  'instanceShortHash',
  'updateOpts.json.container.dockerContainer',
  'updateOpts.json.container.dockerHost'
];

/**
 * Internal route, invoked from worker in response
 * to docker-listener detecting a container-create
 * event and creating a job in a rabbitmq queue
 */
app.post('/workers/on-instance-container-create',
  requestTrace('POST_WORKERS_ON_INSTANCE_CONTAINER_CREATE'),
  logger([], 'POST_WORKERS_ON_INSTANCE_CONTAINER_CREATE', 'info'),
  isInternalRequest,
  containerCreateValidationFlow,
  mw.req().set('contextVersionId', 'body.inspectData.Config.Labels.contextVersionId'),
  mw.req().set('dockerContainer', 'body.id'),
  mw.req().set('dockerHost', 'body.host'),
  mw.req().set('instanceId', 'body.inspectData.Config.Labels.instanceId'),
  mw.req().set('instanceShortHash', 'body.inspectData.Config.Labels.instanceShortHash'),
  mw.req().set('sessionUserId', 'body.inspectData.Config.Labels.sessionUserId'),
  mw.req().set('creatorGithubId', 'body.inspectData.Config.Labels.creatorGithubId'),
  user.findById('sessionUserId').exec('sessionUser'),
  mw.req('sessionUser').require().else(
    user.findByGithubId('creatorGithubId').exec('sessionUser')
  ),
  runnable.new({}, 'sessionUser'),
  // update instance model with container
  function instancePatchBodySetup (req, res, next) {
    logger.log.trace('instancePatchBodySetup');
    req.updateOpts = {
      json: {
        container: {
          dockerContainer: req.body.id, // docker container id
          dockerHost: req.dockerHost, // dock
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

  logger(reqLogKeypaths, 'update instance start'),
  runnable.model.updateInstance('instanceShortHash', 'updateOpts', 'cb').async('instance'),
  logger(reqLogKeypaths, 'update instance finish, startContainer start'),
  runnable.model.startInstance('instanceShortHash', 'cb').async(),
  logger(reqLogKeypaths, 'startContainer finish'),
  mw.res.json(200, {})
);
