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

var docker = require('middlewares/apis').docker;
var isInternalRequest = require('middlewares/is-internal-request');
var validations = require('middlewares/validations');

var containerCreateValidationFlow = flow.series(
  mw.body('instanceId', 'buildId', 'container').pick(),
  mw.body('instanceId').require().validate(validations.isObjectId),
  mw.body('buildId').require().validate(validations.isObjectId)
  // ??? mw.body('buildId').require().validate(validations.isObjectId)
);

/**
 * Internal route, invoked from worker in response
 * to docker-listener detecting a container-create
 * event and creating a job in a rabbitmq queue
 */
app.post('/workers/container-create',
  isInternalRequest,
  containerCreateValidationFlow,
  // start container (need container info)
  docker.create(),
  docker.startUserContainer('container')

  // update instance model

  // primus org-room broadcast
);
