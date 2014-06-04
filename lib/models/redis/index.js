var redis = require('redis');
var configs = require('configs');
module.exports = redis.createClient(configs.redis.port, configs.redis.ipaddress);
