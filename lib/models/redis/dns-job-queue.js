'use strict';

var redis = require('./index');
var RedisMutex = require('./mutex');

module.exports = DnsJobQueue;

function DnsJobQueue (key) {
  this.redis = redis;
  this.key = process.env.REDIS_NAMESPACE+key;
  this.mutex = new RedisMutex(this.key);
}

DnsJobQueue.prototype.lock = function (cb) {
  this.mutex.lock(cb);
};

DnsJobQueue.prototype.unlock = function (cb) {
  this.mutex.unlock(cb);
};

DnsJobQueue.prototype.llen = function (cb) {
  this.redis.llen(this.key, cb);
};

DnsJobQueue.prototype.lrangepop = function (first, last, length, cb) {
  this.redis.multi()
    .lrange(this.key, first, last)
    .ltrim(last, -1)
    .exec(cb);
};

DnsJobQueue.prototype.rpush = function (data, cb) {
  this.redis.rpush(this.key, data, cb);
};

DnsJobQueue.prototype.pub = function (channel, data) {
  this.redis.pub(this.key+':'+channel, data);
};

DnsJobQueue.prototype.sub = function (channel, cb) {
  this.redis.sub(this.key+':'+channel, cb);
};


