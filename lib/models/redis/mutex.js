/**
 * @module lib/models/redis/mutex
 */
'use strict';

var redis = require('models/redis/index');

module.exports = RedisMutex;

/**
 * @class
 * @param {String} key
 */
function RedisMutex(key) {
  this.redis = redis;
  this.key = key;
}

RedisMutex.prototype.lock = function(cb) {
  // SET resource-name anystring NX EX max-lock-time
  // Is a simple way to implement a locking system with Redis.
  // See http://redis.io/commands/set
  var expires = process.env.REDIS_LOCK_EXPIRES;
  this.redis.set(this.key, 'lock', 'NX', 'PX', expires, function(err, success) {
    cb(err, success === 'OK');
  });
};

RedisMutex.prototype.unlock = function(cb) {
  this.redis.del(this.key, cb);
};
