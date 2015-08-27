/**
 * RabbitMQ job management
 * @module lib/models/rabbitmq/hermes
 */
'use strict';

require('loadenv')();
var async = require('async');
var hasKeypaths = require('101/has-keypaths');

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
    heartbeat: 10,
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
    'create-image-builder-container': require('workers/create-image-builder-container').worker,
    'on-create-start-image-builder-container': 
        require('workers/on-create-start-image-builder-container').worker,
    'on-dock-removed': require('workers/on-dock-removed').worker,
    'on-image-builder-container-die': require('workers/on-image-builder-container-die').worker,
    'on-instance-container-create': require('workers/on-instance-container-create').worker,
    'on-instance-container-die': require('workers/on-instance-container-die').worker,
    'start-instance-container': require('workers/start-instance-container').worker
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
  async.each(Object.keys(this.workers), function (workerId, cb) {
    self.hermesClient.unsubscribe(workerId, null, cb);
  }, function (err) {
    log.trace('RabbitMQ.prototype.unloadWorkers complete');
    cb(err);
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

/**
 * create a create-image-builder-container job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.createImageBuilderContainer = function (data) {
  log.info('RabbitMQ.prototype.createImageBuilderContainer');
  var requiredKeys = [
    'manualBuild',
    'sessionUser',
    'contextId',
    'contextVersionId',
    'dockerHost',
    'noCache',
    'tid'
  ];
  if (!hasKeypaths(data, requiredKeys)) {
    console.log('&*(^&*()^()*&^)(&*^)(&^)(&*^  ERRROR');
    log.error({
      tx: true,
      data: data,
      requiredKeys: requiredKeys
    }, 'RabbitMQ.prototype.startInstanceContainer missing required keys');
    return;
  }
  this.hermesClient.publish('create-image-builder-container', data);
};
module.exports = new RabbitMQ();
