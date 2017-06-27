/**
 * @module lib/logger
 */
'use strict'
require('loadenv')()

var bunyan = require('bunyan')
var compose = require('101/compose')
var isFunction = require('101/is-function')
var keypather = require('keypather')()
var pick = require('101/pick')

var envSerializer = require('./serializer-env').serializer
var extraKeySerializer = require('./serializer-extra-keys').serializer
var getNamespace = require('continuation-local-storage').getNamespace

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
 * Returns log for tx from domain
 * @param  {Object} domainData runnable data from domain
 * @return {Object}            tx data
 */
function domainTx (domainData) {
  var date = new Date()
  if (domainData.txTimestamp) {
    // Save delta of time from previous log to this log
    domainData.txMSDelta = date.valueOf() - domainData.txTimestamp.valueOf()
  }
  domainData.txTimestamp = date
  if (domainData.reqStart) {
    domainData.txMSFromReqStart = domainData.txTimestamp.valueOf() -
      domainData.reqStart.valueOf()
  }
  return domainData
}

/**
 * Returns log data for tx from cls
 * @param  {CLS}    nameSpace ponos cls
 * @return {Object|undefined}      tx data
 */
function clsTx (nameSpace) {
  var tid = nameSpace.get('tid')
  return tid ? { tid: tid } : undefined
}

function deepSerialize (data) {
  return Object.keys(data).reduce((serializedData, key) => {
    try {
      serializedData[key] = serializers[key](data[key])
    } catch (err) {
      serializedData[key] = data[key]
    }

    return serializedData
  }, {})
}

/**
 * Take objects with functions as properties and compose them together
 * Allows us to define multiple serializers in different places object and
 * join them together
 */
const serializers = assignAndCompose(bunyan.stdSerializers, {
  tx: function () {
    const domainData = keypather.get(process.domain, 'runnableData')
    if (domainData) {
      return domainTx(domainData)
    }

    const nameSpace = getNamespace('ponos')
    if (nameSpace) {
      return clsTx(nameSpace)
    }
    return undefined
  },
  req: pick(['method', 'url', 'isInternalRequest']),
  build: pick(['_id', 'contextVersions', 'owner', 'failed', 'successful', 'completed']),
  sessionUser: pick(['_id', 'accounts.github.id', 'accounts.github.login', 'accounts.github.username', 'bigPoppaUser.id']),
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
  contextVersion: pick(['_id', 'build._id', 'build.dockerContainer', 'build.completed', 'build.started', 'infraCodeVersion']),
  contextVersions: function (data) {
    if (Array.isArray(data)) {
      return data.map(serializers.contextVersion)
    }
    return serializers.contextVersion(data)
  },
  args: deepSerialize,
  password: function () {
    return '***SANITIZED***'
  }
}, envSerializer, extraKeySerializer)

/**
 * Logger Generator
 * @class
 * @module api:logger
 * @return {object} Logger
 */
var logger = bunyan.createLogger({
  name: process.env.APP_NAME,
  streams: [{
    level: process.env.LOG_LEVEL,
    stream: process.stdout
  }],
  serializers: serializers,
  src: process.env.BUNYAN_LOG_USE_SRC,
  // default values included in all log objects
  branch: process.env._VERSION_GIT_COMMIT,
  commit: process.env._VERSION_GIT_BRANCH,
  environment: process.env.NODE_ENV
})

/**
 * Initiate and return child instance.
 * @returns {object} Logger
 */
module.exports = logger.child({ tx: true })

module.exports._serializers = serializers
