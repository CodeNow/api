var redis = require('redis');
var configs = require('configs');
module.exports = redis.createClient(configs.sharedRedis.port, configs.sharedRedis.ipaddress);
