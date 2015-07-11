/**
 * @module lib/logger
 */
'use strict';

var Bunyan2Loggly = require('bunyan-loggly').Bunyan2Loggly;
var bunyan = require('bunyan');
var bunyanLogentries = require('bunyan-logentries');
var put = require('101/put');
var envIs = require('101/env-is');

var namespace = require('middlewares/request-trace').namespace;

var streams = [{
  level: process.env.LOG_LEVEL,
  stream: process.stdout
}];

if (process.env.LOGENTRIES_TOKEN) {
  streams.push({
    level: 'trace',
    stream: bunyanLogentries.createStream({
      token: process.env.LOGENTRIES_TOKEN
    }),
    type: 'raw'
  });
}
if (process.env.LOGGLY_TOKEN) {
  streams.push({
    level: 'trace',
    stream: new Bunyan2Loggly({
      token: process.env.LOGGLY_TOKEN,
      subdomain: 'sandboxes'
    }),
    type: 'raw'
  });
}

var serializers = put({
  tid: function () {
    return namespace.get('tid');
  }
}, bunyan.stdSerializers);

module.exports = bunyan.createLogger({
  name: 'api',
  streams: streams,
  serializers: serializers,
  src: !envIs('production'), // DO NOT use src in prod, slow
  // default values included in all log objects
  branch: process.env.VERSION_GIT_COMMIT,
  commit: process.env.VERSION_GIT_BRANCH,
  environment: process.env.NODE_ENV
});
