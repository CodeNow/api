'use strict';

require('models/redis/index'); // initalizes redis-types
var RedisTypes = require('redis-types');
var RedisKey = RedisTypes.Key;
var formatArgs = require('format-args');
var debug = require('run-debug')(__filename);

function ActiveApi () {
  this.uuid = process.env.UUID;
  if (!this.uuid) {
    throw new Error('ActiveApi has not been set with a uuid.');
  }
  this.key = process.env.REDIS_NAMESPACE+'active-api';
}

require('util').inherits(ActiveApi, RedisKey);

ActiveApi.prototype.isMe = function (cb) {
  debug('isMe', formatArgs(arguments));
  var uuid = this.uuid;
  this.get(function (err, response) {
    debug('redisKey.get', formatArgs(arguments));
    cb(err, response === uuid);
  });
};

ActiveApi.prototype.setAsMe = function (cb) {
  debug('setAsMe', formatArgs(arguments));
  var uuid = this.uuid;
  if (!uuid) {
    return cb(null, false, 'ActiveApi requires $UUID');
  }
  this.set(uuid, function (err, success) {
    debug('redisKey.set', formatArgs(arguments));
    cb(err, success === 'OK');
  });
};

module.exports = new ActiveApi();
