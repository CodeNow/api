/**
 * Shared hermes instance
 * @module lib/models/rabbitmq/hermes
 */
'use strict';

require('loadenv')();
var debug = require('debug')('api:hermes');

var opts = {
  hostname: process.env.RABBITMQ_HOSTNAME,
  password: process.env.RABBITMQ_PASSWORD,
  port: process.env.RABBITMQ_PORT,
  username: process.env.RABBITMQ_USERNAME
};
debug('hermes options', opts);
module.exports = require('runnable-hermes').hermesSingletonFactory(opts);
