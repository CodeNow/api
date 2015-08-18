/**
 * RabbitMQ job management
 * @module lib/models/rabbitmq/hermes
 */
'use strict';

require('loadenv')();
var createCount = require('callback-count');

var logger = require('middlewares/logger')(__filename);

var log = logger.log;

/**
 * @class
 */
function RabbitMQ () {
  log.info('RabbitMQ constructor');
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
  log.info(opts, 'RabbitMQ.prototype.connect');
  this.hermesClient = require('hermes-private')
    .hermesSingletonFactory(opts)
    .connect(cb);
};

/**
 * Load all workers and subscribe to queues
 * Does not need to wait for hermesClient.on('ready'), hermes queues subscriptions
 * @return null
 */
RabbitMQ.prototype.loadWorkers = function () {
  log.info('RabbitMQ.prototype.loadWorkers');
  this.hermesClient.subscribe('on-instance-container-create',
                              require('workers/on-instance-container-create').worker);
  this.hermesClient.subscribe('start-instance-container',
                              require('workers/start-instance-container').worker);
};

/**
 * Unsubscribe from queues
 * @param {Function} cb
 * @return null
 */
RabbitMQ.prototype.unloadWorkers = function (cb) {
  log.info('RabbitMQ.prototype.unloadWorkers');
  if (!this.hermesClient) {
    return cb();
  }
  var count = createCount(cb);
  this.hermesClient.unsubscribe('on-instance-container-create', null, count.inc().next);
  this.hermesClient.unsubscribe('start-instance-container', null, count.inc().next);
};

/**
 * Disconnect
 * @param {Function} cb
 * @return null
 */
RabbitMQ.prototype.close = function (cb) {
  log.info('RabbitMQ.prototype.close');
  if (!this.hermesClient) {
    return cb();
  }
  this.hermesClient.close(cb);
};

module.exports = new RabbitMQ();
