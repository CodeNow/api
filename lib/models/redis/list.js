'use strict';

var redis = require('./index');
module.exports = RedisList;

function RedisList(key) {
  this.redis = redis;
  this.key = key;
}

RedisList.prototype.lrange = function(first, last, cb) {
  this.redis.lrange(this.key, first, last, cb);
};

Redislist.prototype.lpush = function(data, cb) {
  this.redis.lpush(this.key, data, cb);
};

