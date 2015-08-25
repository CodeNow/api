/**
 * RabbitMQ job management
 * @module lib/models/rabbitmq/hermes
 */
'use strict';

require('loadenv')();
var hasKeypaths = require('101/has-keypaths');

var async = require('async');
var logger = require('middlewares/logger')(__filename);
var CreateInstanceContainer = require('workers/create-instance-container');
var createInstanceContainer = new CreateInstanceContainer();
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
  this.hermesClient.subscribe('create-instance-container',
    createInstanceContainer.handle.bind(createInstanceContainer));
  this.hermesClient.subscribe('start-instance-container',
                              require('workers/start-instance-container').worker);
  this.hermesClient.subscribe('on-dock-removed',
                              require('workers/on-dock-removed').worker);
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
  var tasks = ['on-instance-container-create', 'on-dock-removed',
    'create-instance-container', 'start-instance-container'];
  async.each(tasks, function (task, eachCb) {
    self.hermesClient.unsubscribe(task, null, eachCb);
  }, function () {
    log.trace('RabbitMQ.prototype.unloadWorkers complete');
    cb.apply(this, arguments);
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
 * Publish job using `hermesClient.publish`.
 */
RabbitMQ.prototype.publish = function (name, data) {
  if (!this.hermesClient) {
    return;
  }
  this.hermesClient.publish(name, data);
};
