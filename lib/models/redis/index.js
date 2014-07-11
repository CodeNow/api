'use strict';

var redis = require('redis');
var configs = require('configs');
module.exports = redis.createClient(configs.redis.port, configs.redis.ipaddress);
module.exports.createClient = function () {
  return redis.createClient(configs.redis.port, configs.redis.ipaddress);
};
