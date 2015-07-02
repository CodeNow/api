'use strict';

var bunyan = require('bunyan');
var bunyanLogentries = require('bunyan-logentries');
var envIs = require('101/env-is');

var streams = [{
  level: process.env.LOG_LEVEL,
  stream: process.stdout
}];

if (envIs('staging')) {
  streams.push({
    level: 'trace',
    stream: bunyanLogentries.createStream({
      token: process.env.LOGENTRIES_TOKEN
    }),
    type: 'raw'
  });
}

/**
 * Bunyan logger for api.
 * @author Ryan Sandor Richards
 * @module api:logger
 */
module.exports = bunyan.createLogger({
  name: 'api',
  streams: streams,
  serializers: bunyan.stdSerializers
});
