'use strict';

var Bunyan2Loggly = require('bunyan-loggly').Bunyan2Loggly;
var bunyan = require('bunyan');
var bunyanLogentries = require('bunyan-logentries');
var ElasticSearch = require('bunyan-elasticsearch');

var streams = [{
  level: process.env.LOG_LEVEL,
  stream: process.stdout
}];

var esStream = new ElasticSearch({
  indexPattern: '[logstash-]YYYY.MM.DD',
  type: 'logs',
  host: 'logsene-receiver.sematext.com:80/ff353351-2912-437a-880b-afd7f8394a45/'
});
streams.push({stream: esStream});

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
