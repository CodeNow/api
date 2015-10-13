/**
 * @module lib/logger
 */
'use strict';
require('loadenv')();

var bunyan = require('bunyan');
var envIs = require('101/env-is');
var keypather = require('keypather')();
var put = require('101/put');

var streams = [];

streams.push({
  level: process.env.LOG_LEVEL_STDOUT,
  stream: process.stdout
});

// Do not log to file on production. Disk
// will fill up and process will die.
if(!envIs('production') &&
    process.env.LOG_LEVEL_FILE) {
  streams.push({
    level: process.env.LOG_LEVEL_FILE,
    path: process.cwd()+'/api.log'
  });
}

var serializers = put(bunyan.stdSerializers, {
  tx: function () {
    var runnableData = keypather.get(process.domain, 'runnableData');
    if (!runnableData) {
      runnableData = {};
    }
    runnableData.txTimestamp = new Date();
    return runnableData;
  },
  req: function (req) {
    return {
      method: req.method,
      url: req.url,
      isInternalRequest: req.isInternalRequest
    };
  },
  container: function (container) {
    // prevent CA files from entering logs
    if (container && container.modem) {
      return {
        modem: {
          host: keypather.get(container, 'modem.host'),
          timeout: keypather.get(container, 'modem.timeout')
        },
        id: keypather.get(container, 'id')
      };
    }
    else {
      return container;
    }
  },
  elapsedTimeSeconds: function (date) {
    return (new Date() - date) / 1000;
  },
  response: function (response) {
    // docker API request responses
    if (response && response.modem) {
      return {
        modem: {
          host: keypather.get(response, 'modem.host'),
        },
        id: keypather.get(response, 'id')
      };
    }
    else {
      return response;
    }
  }
});

module.exports = bunyan.createLogger({
  name: 'api',
  streams: streams,
  serializers: serializers,
  // DO NOT use src in prod, slow
  src: !envIs('production'),
  // default values included in all log objects
  branch: process.env.VERSION_GIT_COMMIT,
  commit: process.env.VERSION_GIT_BRANCH,
  environment: process.env.NODE_ENV,
  isQueueWorker: !!process.env.isQueueWorker
});
