var redis = require('redis');
var configs = require('configs');
module.exports = redis.createClient(process.env.REDIS_PORT, process.env.REDIS_IPADDRESS);
