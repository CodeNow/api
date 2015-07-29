/**
 * Coordinates state of "active" vs "inactive" API across
 * multiple active API processes. Will probably be depricated
 * after we incorporate load balancing
 * @module models/redis/active-api
 */
'use strict';

var RedisTypes = require('redis-types');

require('models/redis/index'); // initalizes redis-types
var logger = require('middlewares/logger')(__filename);

var RedisKey = RedisTypes.Key;
var log = logger.log;

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
  log.trace({}, 'isMe');
  var uuid = process.env.UUID;
  this.get(function (err, response) {
    log.trace({
      err: err,
      reponse: response
    }, 'isMe callback');
    cb(err, response === uuid);
  });
};

/**
 * Set current processes to be "active" (implictly setting
 * other API processes "inactive")
 * @param {Function} cb
 */
ActiveApi.prototype.setAsMe = function (cb) {
  log.trace({}, 'setAsMe');
  if (!process.env.UUID) {
    throw new Error('ActiveApi has not been set with a uuid.');
  }
  var uuid = process.env.UUID;
  this.set(uuid, function (err, success) {
    log.trace({
      err: err,
      success: success
    }, 'redisKey.set');
    cb(err, success === 'OK');
  });
};

module.exports = new ActiveApi();
