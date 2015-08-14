/**
 * RabbitMQ job management
 * @module lib/models/rabbitmq/hermes
 */
'use strict';

require('loadenv')();

var async = require('async');
var envIs = require('101/env-is');
var logger = require('middlewares/logger')(__filename);

var log = logger.log;

/**
 * @class
 */
function RabbitMQ () {
  log.info('RabbitMQ constructor');
  this.hermesClient = null;
}


module.exports = new RabbitMQ();
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
  this.hermesClient.subscribe('delete-instance',
                              require('workers/delete-instance').worker);
  this.hermesClient.subscribe('create-instance-container',
                              require('workers/create-instance-container').worker);
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
  var self = this;
  var tasks = ['on-instance-container-create', 'delete-instance', 'create-instance-container'];
  async.eachSeries(tasks, function (task, eachCb) {
    self.hermesClient.unsubscribe(task, null, eachCb);
  }, cb);
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
  // FIXME:
  if (envIs('test')) {
    return cb();
  }
  this.hermesClient.close(cb);
};


/**
 * Publish job using `hermesClient.publish`.
 */
RabbitMQ.prototype.publish = function (name, data) {
  if (!this.hermesClient) {
    return;
  }
  this.hermesClient.publish(name, data);
};
