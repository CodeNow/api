'use strict';

require('models/redis/index'); // initalizes redis-types
var RedisTypes = require('redis-types');
var RedisKey = RedisTypes.Key;
var formatArgs = require('format-args');
var debug = require('debug')('runnable-api:redis:active-api');


function ActiveApi () {
  this.key = process.env.REDIS_NAMESPACE+'active-api';
}

require('util').inherits(ActiveApi, RedisKey);

ActiveApi.prototype.isMe = function (cb) {
  debug('isMe', formatArgs(arguments));
  var uuid = process.env.UUID;
  this.get(function (err, response) {
    debug('redisKey.get', uuid, formatArgs(arguments));
    cb(err, response === uuid);
  });
};

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

module.exports = new ActiveApi();