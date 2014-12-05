'use strict';

require('models/redis/index'); // initalizes redis-types
var RedisTypes = require('redis-types');
var RedisKey = RedisTypes.Key;

module.exports = new ActiveApi();

function ActiveApi () {
  this.uuid = process.env.UUID;
  this.redisKey = new RedisKey(process.env.REDIS_NAMESPACE + ':active-api');
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
};

ActiveApi.prototype.setAsMe = function (cb) {
  var uuid = this.uuid;
  if (!uuid) {
    return cb(null, false, 'ActiveApi requires $UUID');
  }
  this.redisKey.set(uuid, function (err, success) {
    cb(err, success === 'OK');
  });
};
