var redis = require('models/redis');
var async = require('async');

module.exports = SortedSet;

function SortedSet (key) {
  this.key = key;
}

SortedSet.prototype.add = function (args, cb) {
  args.unshift(this.key);
  redis.zadd.call(redis, args, cb);
};

SortedSet.prototype.addAll = function (argsArray, cb) {
  async.map(argsArray, this.add.bind(this), cb);
};

SortedSet.prototype.range = function () {
  var args = Array.prototype.slice.call(arguments);
  args.unshift(this.key);
  redis.zrevrange.apply(redis, args);
};

SortedSet.prototype.listAll = function (cb) {
  this.range(0, -1, 'WITHSCORES', cb);
};

SortedSet.prototype.expire = function () {
  var args = Array.prototype.slice.call(arguments);
  args.unshift(this.key);
  redis.expire.apply(redis, args);
};

SortedSet.prototype.exists = function () {
  var args = Array.prototype.slice.call(arguments);
  args.unshift(this.key);
  redis.exists.apply(redis, args);
};

