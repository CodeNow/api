'use strict';
var redisPubSub = require('redis-pubsub-emitter');

var port = process.env.REDIS_PORT;
var host = process.env.REDIS_IPADDRESS;

module.exports = redisPubSub.createClient(port, host);