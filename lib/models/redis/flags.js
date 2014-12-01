'use strict';

var redis = require('./index');

module.exports = RedisFlags;


/**
 * Flags can be used if we need to save some simple state flag in the Redis.
 * There are 3 basic operations:
 *  - save the flag
 *  - read the flag
 *  - delete the flag
 *  Flags can be used in similar fashion to the locks:
 *    process A sets flag X, process B checks if flag X exist. If it's exist do nothing, otherwise do action.
 */
function RedisFlags () {
  this.redis = redis;
}

RedisFlags.prototype.set = function (key, suffix, value, cb) {
  var fullkey = key + suffix;
  this.redis.set(fullkey, value, cb);
};

RedisFlags.prototype.get = function (key, suffix, cb) {
  var fullkey = key + suffix;
  this.redis.get(fullkey, cb);
};

RedisFlags.prototype.del = function (key, suffix, cb) {
  var fullkey = key + suffix;
  this.redis.del(fullkey, cb);
};