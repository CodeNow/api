'use strict';
var redis = require('./index');
var uuid = require('uuid');

module.exports = RedisMutex;

function RedisMutex (key) {
  this.redis = redis;
  this.key = key;
  // token is used to prevent one client
  // of removing lock set by another
  this.token = uuid();
}

RedisMutex.prototype.lock = function (cb) {
  // SET resource-name anystring NX EX max-lock-time
  // Is a simple way to implement a locking system with Redis.
  // See http://redis.io/commands/set
  var expires = process.env.REDIS_LOCK_EXPIRES;
  this.redis.set(this.key, this.token, 'NX', 'EX', expires, function (err, success) {
    cb(err, success === 'OK');
  });
};

RedisMutex.prototype.unlock = function (cb) {
  var command = 'if redis.call("get",KEYS[1]) == ARGV[1] then';
  command += ' return redis.call("del",KEYS[1])';
  command += ' else return 0 end';
  /*jshint -W061 */
  this.redis.eval(command, 1, this.key, this.token, cb);
  /*jshint +W061 */
};
