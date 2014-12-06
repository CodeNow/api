'use strict';

var redis = require('./index');

module.exports = RedisMutex;

function RedisMutex (key) {
  this.redis = redis;
  this.key = process.env.REDIS_NAMESPACE+key;
}

RedisMutex.prototype.lock = function (cb) {
  this.redis.setnx(this.key, 'lock', function (err, success) {
    if (err) { return cb(err); }
    cb(null, success === '1');
  });
};

RedisMutex.prototype.unlock = function (cb) {
  this.redis.del(this.key, cb);
};
