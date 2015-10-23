/**
 * RabbitMQ job management
 * @module lib/models/rabbitmq/index
 */
'use strict';

require('loadenv')();

var async = require('async');
var hasKeypaths = require('101/has-keypaths');
var hermes = require('hermes-private');
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
  this.hermesClient = hermes.hermesSingletonFactory(opts);
  this.hermesClient.on('error', this._handleFatalError);
  this.hermesClient.connect(cb);
};

// we got rabbitmq error
// solution is to to crash process (it would be restarted automatically)
RabbitMQ.prototype._handleFatalError = function (err) {
  log.fatal({
    tx: true,
    err: err
  }, 'RabbitMQ.prototype.connect hermes error');
  process.exit(1);
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
    'delete-instance',
    'delete-instance-container',
    'deploy-instance',
    'container-network-attached',
    'on-dock-removed',
    'on-image-builder-container-create',
    'on-image-builder-container-die',
    'on-instance-container-create',
    'on-instance-container-die',
    'on-instance-container-start',
    'start-instance-container',
    'stop-instance-container'
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
  if (!this.workers) {
    // Should only ever occur if API exits immediately upon starting
    // before invoking `loadWorkers`
    log.warn('RabbitMQ.prototype.unloadWorkers !this.workers');
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
 * Validate new job data
 * @param {Object} data to be validated
 * @param {Array} required keys that should be presented in the `data`
 * @param {String} methodName that initiated validation. Used for logs
 */
RabbitMQ.prototype._validate = function (data, requiredKeys, methodName) {
  if (!hasKeypaths(data, requiredKeys)) {
    log.error({
      tx: true,
      data: data,
      requiredKeys: requiredKeys
    }, 'RabbitMQ.prototype.' + methodName + ' missing required keys');
    throw new Error('Validation failed');
  }
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
    'instanceId',
    'ownerUsername',
    'sessionUserGithubId',
    'tid'
  ];
  this._validate(data, requiredKeys, 'startInstanceContainer');
  this.hermesClient.publish('start-instance-container', data);
};

/**
 * creates a deploy-instance job and inserts it into the queue
 * @param {Object} data
 *  instanceId || buildId
 *  sessionUserGithubId
 *  ownerUsername
 */
RabbitMQ.prototype.deployInstance = function (data) {
  log.info({
    tx: true,
    data: data
  }, 'RabbitMQ.prototype.deployInstance');

  var requiredKeys = [
    'sessionUserGithubId',
    'ownerUsername'
  ];
  // if instanceId doesnt exist, require buildId, otherwise require instanceId
  requiredKeys.push(!data.instanceId ? 'buildId' : 'instanceId');
  this._validate(data, requiredKeys, 'deployInstance');
  this.hermesClient.publish('deploy-instance', data);
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
    'dockerHost',
    'instanceEnvs',
    'labels'
  ];
  this._validate(data, requiredKeys, 'createInstanceContainer');
  // used to trace flow across multiple workers in loggly
  data.labels.deploymentUuid = uuid.v4();
  log.info({
    tx: true,
    data: data,
  }, 'RabbitMQ.prototype.createInstanceContainer +deploymentUuid');
  this.hermesClient.publish('create-instance-container', data);
};

/**
 * create a stop-instance-container job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.stopInstanceContainer = function (data) {
  log.info({
    tx: true,
    data: data,
  }, 'RabbitMQ.prototype.stopInstanceContainer');
  var requiredKeys = [
    'containerId',
    'dockerHost',
    'instanceId',
    'sessionUserGithubId'
  ];
  this._validate(data, requiredKeys, 'stopInstanceContainer');
  this.hermesClient.publish('stop-instance-container', data);
};

/**
 * create a delete-instance job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.deleteInstance = function (data) {
  log.info({
    tx: true,
    data: data,
  }, 'RabbitMQ.prototype.deleteInstance');
  var requiredKeys = [
    'instanceId',
    'sessionUserId'
  ];
  this._validate(data, requiredKeys, 'deleteInstance');
  this.hermesClient.publish('delete-instance', data);
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
    'container.dockerContainer',
    'instanceName',
    'instanceShortHash',
    'instanceMasterPod',
    'instanceMasterBranch',
    'ownerGithubId'
  ];
  this._validate(data, requiredKeys, 'deleteInstanceContainer');
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
    'ownerUsername',
    'contextId',
    'contextVersionId',
    'dockerHost',
    'noCache',
    'tid'
  ];
  this._validate(data, requiredKeys, 'createImageBuilderContainer');
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
  this._validate(data, requiredKeys, 'publishClusterProvision');
  this.hermesClient.publish('cluster-provision', data);
};

/**
 * create an cluster-deprovision job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.publishClusterDeprovision = function (data) {
  log.info({
    tx: true,
    data: data,
  }, 'RabbitMQ.prototype.publishClusterDeprovision');
  var requiredKeys = [
    'githubId'
  ];
  this._validate(data, requiredKeys, 'publishClusterDeprovision');
  this.hermesClient.publish('cluster-deprovision', data);
};
