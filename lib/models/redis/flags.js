'use strict';

var redis = require('./index');

module.exports = RedisFlags;

function RedisFlags () {
  this.redis = redis;
}

RedisFlags.prototype.set = function (key, suffix, value, cb) {
  var fullkey = key + suffix;
  this.redis.set(fullkey, value, cb);
};

RedisFlags.prototype.del = function (key, suffix, cb) {
  var fullkey = key + suffix;
  this.redis.del(fullkey, cb);
};