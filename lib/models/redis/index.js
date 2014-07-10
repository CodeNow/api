var redis = require('redis');
module.exports = redis.createClient(process.env.REDIS_PORT, process.env.REDIS_IPADDRESS);
