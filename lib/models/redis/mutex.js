'use strict';

var redis = require('./index');
var isFunction = require('101/is-function');
var formatArgs = require('format-args');
var debug = require('run-debug')(__filename);

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
  debug('unlock', formatArgs(arguments));
  this.redis.del(this.key, cb);
};
