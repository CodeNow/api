/**
 * generates a one time use token into redis
 * @module models/redis/token
 */
'use strict';
require('loadenv')();

var uuid = require('uuid');

var logger = require('middlewares/logger')(__filename);
var redis = require('models/redis');

var log = logger.log;

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
  log.info({
    tx: true,
    value: value,
    key: self.key
  }, 'Token.prototype.setValue');
  redis.multi()
    .lpush(self.key, value)
    .expire(self.key, process.env.SINGLE_USE_TOKEN_EXPIRE_TIME_SECONDS)
    .exec(cb);
};
