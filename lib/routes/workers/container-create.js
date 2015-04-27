/**
 * Internal route for job queue system, respond to
 * container create event
 * POST /workers/container-create
 * @module lib/routes/workers/container-create
 */
'use strict';

var express = require('express');
var app = module.exports = express();
var flow = require('middleware-flow');
var mw = require('dat-middleware');

var isInternalRequest = require('middlewares/is-internal-request');
var runnable = require('middlewarize')(require('models/apis/runnable'));
var validations = require('middlewares/validations');

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

  // configure for updateInstance?
  mw.req().set('instanceId', 'body.inspectData.Config.Labels.instanceId'),
  mw.req().set('contextVersionId', 'body.inspectData.Config.Labels.contextVersionId'),
  mw.req().set('ownerUsername', 'body.inspectData.Config.Labels.ownerUsername'),
  mw.req().set('dockerContainer', 'body.id'),
  mw.req().set('dockerHost', 'body.host'),

  containerCreateValidationFlow,
  runnable.new(),
  runnable.model.updateInstance('body', 'cb').async('instance'),
  runnable.model.deployInstance('instance')
  //mw.res().send(200)
);

  /*
  instances.findById('instanceId').exec('instance'),
  //TODO error logic
  flow.try(
    instances.model.modifyContainer('contextVersionId', 'dockerContainer', 'dockerHost')
  ).catch(
    mw.req().setToErr('err'),
    mw.req('err.output.statusCode').validate(validations.equals(409))
      .then(
        // ignore err, this is an expected case (build could've changed)
        mw.res.send(202)
      )
  ),
  docker.new(),
  flow.try(
    docker.model.startUserContainer('containerInfo')
  ).catch(
    // we've seen layer limit errors bubble from startContainer
    mw.req().setToErr('containerStartErr'),
    instances.model.modifyContainerCreateErr(
      'contextVersionId', 'containerStartErr')
  ),
  mw.req('instance.container.dockerContainer').require()
    .then( // container created and started successfully
      instances.model.inspectAndUpdate(),
      sauron.new('dockerHost'),
      sauron.model.attachHostToContainer(
        'instance.network.networkIp',
        'instance.network.hostIp',
        'instance.container.dockerContainer',
        'cb'),
      // upsert new hosts
      hosts.new(),
      hosts.model.upsertHostsForInstance('ownerUsername', 'instance', 'cb')
    )
    // PRIMUS ROOM BROADCAST CONTAINER EVENT
    // "deployed" is new event (replacing "deploy")
  );
  */
