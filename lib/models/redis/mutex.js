'use strict';

var redis = require('./index');

module.exports = RedisMutex;

function RedisMutex (key) {
  this.redis = redis;
  this.key = key;
}

RedisMutex.prototype.lock = function (cb) {
  this.redis.setnx(key, 'lock', cb);
};

RedisMutex.prototype.unlock = function (cb) {
  this.redis.del(key, cb);
};