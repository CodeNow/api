/**
 * @module lib/logger
 */
'use strict';

var Bunyan2Loggly = require('bunyan-loggly').Bunyan2Loggly;
var ElasticSearch = require('bunyan-elasticsearch');
var bunyan = require('bunyan');
var bunyanLogentries = require('bunyan-logentries');
var keypather = require('keypather')();

var streams = [{
  level: process.env.LOG_LEVEL,
  stream: process.stdout
}];

if (process.env.LOGSENE_TOKEN) {
  streams.push({
    stream: new ElasticSearch({
      host: 'logsene-receiver.sematext.com:80/',
      index: process.env.LOGSENE_TOKEN,
      type: 'logs'
    }),
    level: 'info'
  });
}
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

/**
 * Bunyan logger for api.
 * @author Ryan Sandor Richards
 * @module api:logger
 */
var logger = bunyan.createLogger({
  name: 'api',
  streams: streams,
  serializers: bunyan.stdSerializers,
  src: true,
  // default values included in all log objects
  branch: process.env.VERSION_GIT_COMMIT,
  commit: process.env.VERSION_GIT_BRANCH,
  environment: process.env.NODE_ENV
});

// Temporary while I figure out elasticsearch
function wrapMethods (logger) {
  [
    'trace',
    'debug',
    'info',
    'warn',
    'error',
    'fatal'
  ].forEach(function (method) {
    var original = logger.prototype[method];
    logger[method] = function (data, message) {
      data = JSON.parse(JSON.stringify(data));
      data = keypather.flatten(data, '.');
      return original(data, message);
    };
  });
}
wrapMethods(logger);

var child = logger.child;
logger.child = function () {
  var newChild = child.apply(logger, arguments);
  wrapMethods(newChild);
  return newChild;
};

module.exports = logger;
