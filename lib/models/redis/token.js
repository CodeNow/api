/**
 * generates a one time use token into redis
 * @module models/redis/token
 */
'use strict';
require('loadenv')();

var debug = require('debug')('runnable-api:redis:token');
var uuid = require('uuid');

var redis = require('models/redis');

module.exports = Token;
/**
 * generates random token as key and sets a value on it
 * @class
 */
function Token () {
  this.key = process.env.REDIS_NAMESPACE + uuid();
}
/**
 * returns key for token
 * @return {string} key used for redis
 */
Token.prototype.getKey = function () {
  return this.key;
};
/**
 * sets value to random token
 * @param {Function} cb (err, token)
 */
Token.prototype.setValue = function (value, cb) {
  var self = this;
  debug('setValue', value, 'key', self.key);
  redis.multi()
    .lpush(self.key, value)
    .expire(self.key, process.env.SINGLE_USE_TOKEN_EXPIRE_TIME_SECONDS)
    .exec(cb);
};