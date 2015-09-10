/**
 * RabbitMQ job management
 * @module lib/models/rabbitmq/hermes
 */
'use strict';

require('loadenv')();

var async = require('async');
var hasKeypaths = require('101/has-keypaths');
var uuid = require('node-uuid');

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
  log.info('RabbitMQ.prototype.loadWorkers');
  var self = this;
  this.workers = [
    'create-image-builder-container',
    'create-instance-container',
    'delete-instance-container',
    'on-dock-removed',
    'on-image-builder-container-create',
    'on-image-builder-container-die',
    'on-instance-container-create',
    'on-instance-container-die',
    'on-instance-container-start',
    'start-instance-container'
  ];
  this.workers.forEach(function (workerQueueName) {
    log.trace('RabbitMQ.prototype.loadWorkers ' + workerQueueName);
    self.hermesClient.subscribe(workerQueueName, require('workers/' + workerQueueName).worker);
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
    log.warn('RabbitMQ.prototype.unloadWorkers !hermesClient');
    return cb();
  }
  async.each(this.workers, function (workerQueueName, cb) {
    log.trace('RabbitMQ.prototype.unloadWorkers ' + workerQueueName);
    self.hermesClient.unsubscribe(workerQueueName, null, cb);
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
  log.info({
    tx: true,
    data: data,
  }, 'RabbitMQ.prototype.startInstanceContainer');
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
 * create a create-instance-container job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.createInstanceContainer = function (data) {
  log.info({
    tx: true,
    data: data,
  }, 'RabbitMQ.prototype.createInstanceContainer');
  var requiredKeys = [
    'cvId',
    'sessionUserId',
    'buildId',
    'dockerHost',
    'instanceEnvs',
    'labels'
  ];
  if (!hasKeypaths(data, requiredKeys)) {
    log.error({
      tx: true,
      data: data,
      requiredKeys: requiredKeys
    }, 'RabbitMQ.prototype.createInstanceContainer missing required keys');
    return;
  }
  // used to trace flow across multiple workers in loggly
  data.deploymentUuid = uuid.v4();
  this.hermesClient.publish('create-instance-container', data);
};

/**
 * create a delete-instance-container job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.deleteInstanceContainer = function (data) {
  log.info({
    tx: true,
    data: data,
  }, 'RabbitMQ.prototype.deleteInstanceContainer');
  var requiredKeys = [
    'container',
    'networkIp',
    'hostIp',
    'instanceName',
    'instanceShortHash',
    'instanceMasterPod',
    'instanceMasterBranch',
    'ownerGithubId'
  ];
  if (!hasKeypaths(data, requiredKeys)) {
    log.error({
      tx: true,
      data: data,
      requiredKeys: requiredKeys
    }, 'RabbitMQ.prototype.deleteInstanceContainer missing required keys');
    return;
  }
  this.hermesClient.publish('delete-instance-container', data);
};

/**
 * create a create-image-builder-container job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.createImageBuilderContainer = function (data) {
  log.info({
    tx: true,
    data: data,
  }, 'RabbitMQ.prototype.createImageBuilderContainer');
  var requiredKeys = [
    'manualBuild',
    'sessionUserGithubId',
    'contextId',
    'contextVersionId',
    'dockerHost',
    'noCache',
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
  this.hermesClient.publish('create-image-builder-container', data);
};

/**
 * create an cluster-provision job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.publishClusterProvision = function (data) {
  log.info({
    tx: true,
    data: data,
  }, 'RabbitMQ.prototype.publishClusterProvision');
  var requiredKeys = [
    'githubId'
  ];
  if (!hasKeypaths(data, requiredKeys)) {
    log.error({
      tx: true,
      data: data,
      requiredKeys: requiredKeys
    }, 'RabbitMQ.prototype.publishClusterProvision missing required keys');
    return;
  }
  this.hermesClient.publish('cluster-provision', data);
};

module.exports = new RabbitMQ();
