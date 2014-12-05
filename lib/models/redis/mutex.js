'use strict';

var redis = require('./index');

module.exports = RedisMutex;

function RedisMutex (key) {
  this.redis = redis;
  this.key = key;
}

RedisMutex.prototype.lock = function (cb) {
  this.redis.setnx(process.env.REDIS_NAMESPACE+this.key, 'lock', cb);
};

RedisMutex.prototype.unlock = function (cb) {
  this.redis.del(process.env.REDIS_NAMESPACE+this.key, cb);
};
