'use strict';

var redis = require('./index');
var mutex = require('./mutex');

module.exports = RedisList;

function RedisList (key) {
  this.redis = redis;
  this.key = process.env.REDIS_NAMESPACE+key;
  this.mutex = new mutex(this.key);
}

RedisList.prototype.lock = function (cb) {
  this.mutex.lock(cb);
};

RedisList.prototype.unlock = function (cb) {
  this.mutex.unlock(cb);
};

RedisList.prototype.llen = function (cb) {
  this.redis.llen(this.key, cb);
};

RedisList.prototype.lrangepop = function (first, last, length, cb) {
  this.redis.multi()
    .lrange(this.key, first, last)
    .ltrim(last, -1)
    .exec(cb);
};

RedisList.prototype.rpush = function (data, cb) {
  this.redis.rpush(this.key, data, cb);
};

