'use strict';

var redis = require('./index');
var debug = require('run-debug')(__filename);
var formatArgs = require('format-args');


module.exports = RedisMutex;

function RedisMutex (key) {
  this.redis = redis;
  this.key = key;
}

RedisMutex.prototype.lock = function (cb) {
  debug('lock', this.key, formatArgs(arguments));
  this.redis.setnx(this.key, 'lock', function (err, success) {
    cb(err, success === '1');
  });
};

RedisMutex.prototype.unlock = function (cb) {
  debug('unlock', this.key, formatArgs(arguments));
  this.redis.del(this.key, cb);
};