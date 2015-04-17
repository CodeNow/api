/**
 * Load workers and subscribe to jobs
 * @module workers/index
 */
'use strict';

require('loadenv')();

var debug = require('debug')('api:worker:index');

var opts = {
  hostname: process.env.RABBITMQ_HOSTNAME,
  password: process.env.RABBITMQ_PASSWORD,
  port: process.env.RABBITMQ_PORT,
  username: process.env.RABBITMQ_USERNAME
};
debug('hermes options', opts);
var hermes = require('hermes').hermesSingletonFactory(opts);

var workers = {
  containerCreateWorker: require('./container-create')
};

workers.containerCreateWorker(hermes);
