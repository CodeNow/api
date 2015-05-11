/**
 * RabbitMQ job management
 * @module lib/models/rabbitmq/hermes
 */
'use strict';

require('loadenv')();

var debug = require('debug')('api:rabbitmq');
var isFunction = require('101/is-function');

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
  debug('hermes options', opts);
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
  this.hermesClient.subscribe('container-create', require('workers/container-create').worker);
};

module.exports = RabbitMQ;
