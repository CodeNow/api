'use strict';
var RedisKey = require('redis-types').Key;

module.exports = RedisFlags;


/**
 * Flags can be used if we need to save some simple state flag in the Redis.
 * There are 3 basic operations:
 *  - `set` the flag
 *  - check if flag `exists`
 *  - `del` the flag
 *  Flags can be used in similar fashion to the locks:
 *    process A sets flag X, process B checks if flag X exist.
 *    If it's exist do nothing, otherwise do action.
 */
function RedisFlags (namespace, key) {
  var fullKey = [process.env.REDIS_NAMESPACE, namespace, key].join(':');
  this.key = fullKey;
}

require('util').inherits(RedisFlags, RedisKey);

RedisFlags.prototype.set = function (value, cb) {
  this.redisClient.set(this.key, value, cb);
};