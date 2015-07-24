/**
 * RabbitMQ job management
 * @module lib/models/rabbitmq/hermes
 */
'use strict';

require('loadenv')();

var envIs = require('101/env-is');
var isFunction = require('101/is-function');

var logger = require('middlewares/logger')(__filename);

var log = logger.log;

/**
 * @class
 */
function RabbitMQ () {
  this.hermesClient = null;
}

/**
 * Initiate connection to RabbitMQ server
 * Can be run synchronously, publish/subscribe invokations will be queued
 * Optional callback behavior
 * @param {Function} cb - optional callback
 * @return null
 */
RabbitMQ.prototype.connect = function (cb) {
  var opts = {
    hostname: process.env.RABBITMQ_HOSTNAME,
    password: process.env.RABBITMQ_PASSWORD,
    port: process.env.RABBITMQ_PORT,
    username: process.env.RABBITMQ_USERNAME
  };
  log.info(opts, 'rabbitmq connect');
  this.hermesClient = require('runnable-hermes').hermesSingletonFactory(opts);
  if (isFunction(cb)) {
    this.hermesClient.on('ready', cb);
  }
};

/**
 * Load all workers and subscribe to queues
 * Does not need to wait for hermesClient.on('ready'), hermes queues subscriptions
 * @return null
 */
RabbitMQ.prototype.loadWorkers = function () {
  // only run once
  log.info('rabbitmq load workers');
  this.hermesClient.subscribe('container-create', require('workers/container-create').worker);
};

/**
 * Unsubscribe from queues
 * @param {Function} cb
 * @return null
 */
RabbitMQ.prototype.unloadWorkers = function (cb) {
  // only run once
  log.info('rabbitmq unload workers');
  if (!this.hermesClient || !this.hermesClient.unsubscribe) {
    log.info('unloadWorkers: rabbitmq not connected');
    return cb();
  }
  this.hermesClient.unsubscribe('container-create', null, cb);
};

/**
 * Disconnect
 * @param {Function} cb
 * @return null
 */
RabbitMQ.prototype.close = function (cb) {
  // FIXME:
  if (envIs('test')) {
    return cb();
  }
  log.info('rabbitmq close');
  this.hermesClient.close(cb);
};

module.exports = RabbitMQ;
