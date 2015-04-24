/**
 * Load workers and subscribe to jobs
 * @module workers/index
 */
'use strict';

require('loadenv')();
//var debug = require('debug')('api:worker:index');
var hermesClient = require('lib/models/rabbitmq/hermes');
var workers = {
  containerCreateWorker: require('./container-create')
};
workers.containerCreateWorker(hermesClient);
