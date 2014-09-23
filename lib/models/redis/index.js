'use strict';
var redis = require('redis');
module.exports = redis.createClient(
  process.env.REDIS_PORT,
  process.env.REDIS_IPADDRESS,
  {
    detect_buffers: true
  });
require('redis-types')({ redisClient: module.exports });
module.exports.createClient = function () {
  return redis.createClient(
    process.env.REDIS_PORT,
    process.env.REDIS_IPADDRESS,
    {
      detect_buffers: true
    });
};
