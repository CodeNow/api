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
  this.get(function (err, response) {
    debug('redisKey.get', global.api.uuid, formatArgs(arguments));
    cb(err, response === global.api.uuid);
  });
};

ActiveApi.prototype.setAsMe = function (cb) {
  debug('setAsMe', formatArgs(arguments));
  if (!global.api.uuid) {
    throw new Error('ActiveApi has not been set with a uuid.');
  }
  this.set(global.api.uuid, function (err, success) {
    debug('redisKey.set', formatArgs(arguments));
    cb(err, success === 'OK');
  });
};

module.exports = new ActiveApi();