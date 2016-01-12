/**
 * @module lib/logger
 */
'use strict'
require('loadenv')()

var bunyan = require('bunyan')
var clone = require('101/clone')
var del = require('101/del')
var envIs = require('101/env-is')
var keypather = require('keypather')()
var pick = require('101/pick')
var put = require('101/put')

var streams = []

streams.push({
  level: process.env.LOG_LEVEL_STDOUT,
  stream: process.stdout
})

// Do not log to file on production. Disk
// will fill up and process will die.
if (!envIs('production') &&
  process.env.LOG_LEVEL_FILE) {
  streams.push({
    level: process.env.LOG_LEVEL_FILE,
    path: process.cwd() + '/api.log'
  })
}

var serializers = put(bunyan.stdSerializers, {
  tx: function () {
    var runnableData = keypather.get(process.domain, 'runnableData')
    if (!runnableData) {
      runnableData = {}
    }
    var date = new Date()
    if (runnableData.txTimestamp) {
      // Save delta of time from previous log to this log
      runnableData.txMSDelta = date.valueOf() - runnableData.txTimestamp.valueOf()
    }
    runnableData.txTimestamp = date
    if (runnableData.reqStart) {
      runnableData.txMSFromReqStart = runnableData.txTimestamp.valueOf() -
        runnableData.reqStart.valueOf()
    }
    return runnableData
  },
  req: function (req) {
    return {
      method: req.method,
      url: req.url,
      isInternalRequest: req.isInternalRequest
    }
  },
  build: function (build) {
    return pick(build, ['_id', 'contextVersions', 'owner', 'failed', 'successful', 'completed'])
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
      }
    } else {
      return pick(container, ['dockerContainer', 'dockerHost'])
    }
  },
  elapsedTimeSeconds: function (date) {
    return (new Date() - date) / 1000
  },
  response: function (response) {
    // docker API request responses
    if (response && response.modem) {
      return {
        modem: {
          host: keypather.get(response, 'modem.host')
        },
        id: keypather.get(response, 'id')
      }
    } else {
      return response
    }
  },
  args: function (data) {
    return _removeExtraKeys(data)
  },
  opts: function (data) {
    return _removeExtraKeys(data)
  },
  data: function (data) {
    return _removeExtraKeys(data)
  },
  instance: function (data) {
    return _removeExtraKeys(data)
  },
  contextVersion: function (data) {
    return _removeExtraKeys(data)
  }
})

/**
 * attempts to remove unnecessary keys
 * @param  {Object} data object to prune
 * @return {Object}      clone of data with some keys removed
 */
function _removeExtraKeys (data) {
  if (data.toJSON) {
    data = data.toJSON()
  }
  var newData = {};
  if (typeof data === 'object') {
    Object.keys(data).forEach(function (key) {
      if (data[key].toJSON) {
        newData[key] = data[key].toJSON()
      } else {
        newData[key] = data[key]
      }
    })
  }
  del(newData, 'instance.contextVersion.build.log')
  del(newData, 'instance.contextVersions[0].build.log')
  del(newData, 'contextVersion.build.log')
  del(newData, 'contextVersions[0].build.log')
  del(newData, 'build.log')
  del(newData, 'ca')
  del(newData, 'cert')
  del(newData, 'key')
  return newData
}

module.exports = bunyan.createLogger({
  name: 'api',
  streams: streams,
  serializers: serializers,
  // DO NOT use src in prod, slow
  src: !envIs('production'),
  // default values included in all log objects
  branch: process.env.VERSION_GIT_COMMIT,
  commit: process.env.VERSION_GIT_BRANCH,
  environment: process.env.NODE_ENV
})

module.exports._removeExtraKeys = _removeExtraKeys
module.exports._serializers = serializers
