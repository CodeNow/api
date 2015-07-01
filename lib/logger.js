'use strict';

var bunyan = require('bunyan');
//var RedisTransport = require('bunyan-redis');
var bunyanLogentries = require('bunyan-logentries');

/**
 * Bunyan logger for api.
 * @author Ryan Sandor Richards
 * @module api:logger
 */
module.exports = bunyan.createLogger({
  name: 'api',
  streams: [
    {
      level: process.env.LOG_LEVEL,
      stream: process.stdout
    },
    {
      level: 'trace',
      stream: bunyanLogentries.createStream({token: token}),
      type: 'raw'
    }
    /*
    {
      type: 'raw',
      level: process.env.LOG_REDIS_LEVEL,
      stream: new RedisTransport({
        container: process.env.LOG_REDIS_KEY,
        host: process.env.LOG_REDIS_HOST,
        port: process.env.LOG_REDIS_PORT
      })
    }
    */
  ],
  serializers: bunyan.stdSerializers
});
