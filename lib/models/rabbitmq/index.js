/**
 * RabbitMQ job management
 * @module lib/models/rabbitmq/hermes
 */
'use strict';

require('loadenv')();
var createCount = require('callback-count');
var hasKeypaths = require('101/has-keypaths');

var logger = require('middlewares/logger')(__filename);

var log = logger.log;

var createCount = require('callback-count');

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
  var self = this;
  this.workers = {
    'on-instance-container-create': require('workers/on-instance-container-create').worker,
    'start-instance-container': require('workers/start-instance-container').worker,
    'on-dock-removed': require('workers/on-dock-removed').worker,
    'on-instance-container-die': require('workers/on-instance-container-die').worker
  };
  log.info('RabbitMQ.prototype.loadWorkers');
  Object.keys(this.workers).forEach(function (workerId) {
    self.hermesClient.subscribe(workerId, self.workers[workerId]);
  });

};

/**
 * Unsubscribe from queues
 * @param {Function} cb
 * @return null
 */
RabbitMQ.prototype.unloadWorkers = function (cb) {
  var self = this;
  log.info('RabbitMQ.prototype.unloadWorkers');
  if (!this.hermesClient) {
    return cb();
  }

  var count = createCount(this.workers.length, function () {
    log.trace('RabbitMQ.prototype.unloadWorkers complete');
    cb.apply(this, arguments);
  });
  Object.keys(this.workers).forEach(function (workerId) {
    self.hermesClient.unsubscribe(workerId, null, count.next);
  });
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
  this.hermesClient.close(function () {
    log.trace('RabbitMQ.prototype.close complete');
    cb.apply(this, arguments);
  });
};

/**
 * create a start-instance-container job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.startInstanceContainer = function (data) {
  log.info('RabbitMQ.prototype.startInstanceContainer');
  var requiredKeys = [
    'dockerContainer',
    'dockerHost',
    'hostIp',
    'instanceId',
    'networkIp',
    'ownerUsername',
    'sessionUserGithubId',
    'tid'
  ];
  if (!hasKeypaths(data, requiredKeys)) {
    log.error({
      tx: true,
      data: data,
      requiredKeys: requiredKeys
    }, 'RabbitMQ.prototype.startInstanceContainer missing required keys');
    return;
  }
  this.hermesClient.publish('start-instance-container', data);
};

module.exports = new RabbitMQ();
