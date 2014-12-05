'use strict';

var isFunction = require('101/is-function');
var Boom = require('dat-middleware').Boom;
var redis = require('models/redis/index');
var RedisTypes = require('redis-types', {
  redisClient: redis
});
var RedisKey = RedisTypes.Key;

module.exports = new ActiveApi();

function ActiveApi () {
  this.uuid = process.env.UUID;
  this.redisKey = new RedisKey(process.env.REDIS_NAMESPACE + ':active-api-lock');
  return this;
}

ActiveApi.prototype.isMe = function (cb) {
  var uuid = this.uuid;
  if (!uuid) {
    return cb(null, false, 'ActiveApi has not been set with a uuid.');
  }
  this.redisKey.get(function (err, response) {
    cb(err, response === uuid);
  });
}

ActiveApi.prototype.setMe = function (cb) {
  var uuid = this.uuid;
  if (!uuid) {
    return cb(null, false, 'ActiveApi requires $UUID');
  }
  this.redisKey.set(uuid, function (err, success) {
    cb(err, success === 'OK');
  });
}
