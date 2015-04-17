/**
 * generates a one time use token into redis
 * @module models/redis/token
 */
'use strict';
var redis = require('models/redis');

var debug = require('debug')('runnable-api:redis:token');
var formatArgs = require('format-args');
var uuid = require('uuid');

module.exports = Token;

/**
 * generates random token as key and sets a value on it
 * @class
 */
function Token () {
  this.key = process.env.REDIS_NAMESPACE + ':' + uuid();
}

/**
 * sets value to random token
 * @param {Function} cb (err, token)
 */
Token.prototype.setValue = function (value, cb) {
  var self = this;
  debug('setValue', formatArgs(arguments), 'key', self.key);
  redis.multi()
    .lpush(self.key, value)
    .expire(self.key, process.env.SINGLE_USE_TOKEN_EXPIRE_TIME_S)
    .exec(function (err) {
      if (err) { return cb(err); }
      cb(err, self.key);
    });
};