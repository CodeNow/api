/**
 * Shared instance of redis client w/ extension
 * to create additional instances of redis client
 * @module lib/models/redis/index
 */
'use strict';

var redis = require('redis');

module.exports = redis.createClient(
  process.env.REDIS_PORT,
  process.env.REDIS_IPADDRESS,
  {
    detect_buffers: true
  });
require('redis-types')({
  redisClient: module.exports
});
module.exports.createClient = function() {
  return redis.createClient(
    process.env.REDIS_PORT,
    process.env.REDIS_IPADDRESS,
    {
      detect_buffers: true
    });
};
