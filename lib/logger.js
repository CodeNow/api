/**
 * @module lib/logger
 */
'use strict';

var Bunyan2Loggly = require('bunyan-loggly').Bunyan2Loggly;
var bunyan = require('bunyan');
var bunyanLogentries = require('bunyan-logentries');
var keypather = require('keypather')();
var shimmer = require('shimmer');

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

module.exports = bunyan.createLogger({
  name: 'api',
  streams: streams,
  serializers: bunyan.stdSerializers,
  src: true,
  // default values included in all log objects
  branch: process.env.VERSION_GIT_COMMIT,
  commit: process.env.VERSION_GIT_BRANCH,
  environment: process.env.NODE_ENV
});

shimmer.wrap(module.exports, 'child', function (original) {
  return function () {
    var child = original.apply(this, arguments);
    [
      'trace',
      'debug',
      'info',
      'warn',
      'error',
      'fatal'
    ].forEach(function (lvl) {
      shimmer.wrap(child, lvl, function (original) {
        return function (metaData, message) {
          //extend metaData
          if (!message) {
            message = metaData;
            metaData = {};
          }
          if (!keypather.get(metaData, 'tid')) {
            keypather.set(metaData, 'tid', namespace.get('tid'));
          }
          return original.apply(this, arguments);
        };
      });
    });
    return child;
  };
});
