/**
 * Coordinates state of "active" vs "inactive" API across
 * multiple active API processes. Will probably be depricated
 * after we incorporate load balancing
 * @module models/redis/active-api
 */
'use strict';

require('models/redis/index'); // initalizes redis-types
var RedisTypes = require('redis-types');
var debug = require('debug')('runnable-api:redis:active-api');

var formatArgs = require('format-args');

module.exports = new ActiveApi();

var RedisKey = RedisTypes.Key;

/**
 * Track active/inactive state
 * @class
 */
function ActiveApi () {
  this.key = process.env.REDIS_NAMESPACE + 'active-api';
}

require('util').inherits(ActiveApi, RedisKey);

/**
 * Determine if current process is "active"
 * @param {Function} cb
 */
ActiveApi.prototype.isMe = function (cb) {
  debug('isMe', formatArgs(arguments));
  var uuid = process.env.UUID;
  this.get(function (err, response) {
    debug('redisKey.get', uuid, formatArgs(arguments));
    cb(err, response === uuid);
  });
};

/**
 * Set current processes to be "active" (implictly setting
 * other API processes "inactive")
 * @param {Function} cb
 */
ActiveApi.prototype.setAsMe = function (cb) {
  debug('setAsMe', formatArgs(arguments));
  if (!process.env.UUID) {
    throw new Error('ActiveApi has not been set with a uuid.');
  }
  var uuid = process.env.UUID;
  this.set(uuid, function (err, success) {
    debug('redisKey.set', formatArgs(arguments));
    cb(err, success === 'OK');
  });
};
