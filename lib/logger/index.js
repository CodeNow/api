/**
 * @module lib/logger
 */
'use strict'
require('loadenv')()

var bunyan = require('bunyan')
var envIs = require('101/env-is')
var keypather = require('keypather')()
var pick = require('101/pick')
var compose = require('101/compose')
var isFunction = require('101/is-function')

var envSerializer = require('./serializer-env').serializer
var extraKeySerializer = require('./serializer-extra-keys').serializer

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

/**
 * Take an array of objects and compose all the functions in the object properties
 * together. We do this in order to be able to use multiple logging serializers
 * that can be independently defined.
 */
var assignAndCompose = function () {
  var args = [].slice.apply(arguments)
  var obj = {}
  args.forEach(function (paramObj) {
    Object.keys(paramObj).forEach(function (key) {
      if (isFunction(paramObj[key])) {
        if (obj[key]) {
          obj[key] = compose(obj[key], paramObj[key])
          return
        }
        obj[key] = paramObj[key]
      }
    })
  })
  return obj
}

/**
 * Take objects with functions as properties and compose them together
 * Allows us to define multiple serializers in different places object and
 * join them together
 */
var serializers = assignAndCompose(bunyan.stdSerializers, {
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
  req: pick(['method', 'url', 'isInternalRequest']),
  build: pick(['_id', 'contextVersions', 'owner', 'failed', 'successful', 'completed']),
  sessionUser: pick(['_id', 'accounts.github.id', 'accounts.github.login', 'accounts.github.username']),
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
  contextVersion: pick(['_id', 'build._id', 'build.dockerContainer', 'build.completed', 'build.started']),
  contextVersions: function (data) {
    if (Array.isArray(data)) {
      return data.map(serializers.contextVersion)
    }
    return serializers.contextVersion(data)
  }
}, envSerializer, extraKeySerializer)

module.exports = bunyan.createLogger({
  name: 'api',
  streams: streams,
  serializers: serializers,
  // DO NOT use src in prod, slow
  src: !envIs('production'),
  // default values included in all log objects
  branch: process.env._VERSION_GIT_COMMIT,
  commit: process.env._VERSION_GIT_BRANCH,
  environment: process.env.NODE_ENV
})

module.exports._serializers = serializers