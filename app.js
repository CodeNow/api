/**
 * Index file of API, program begins here
 * @module app
 */
'use strict'
require('loadenv')()

if (process.env.NEW_RELIC_LICENSE_KEY) {
  require('newrelic')
}

var createCount = require('callback-count')

var ApiServer = require('server')
var dogstatsd = require('models/datadog')
var envIs = require('101/env-is')
var error = require('error')
var keyGen = require('key-generator')
var logger = require('middlewares/logger')(__filename)
var mongooseControl = require('models/mongo/mongoose-control')
var redisClient = require('models/redis')
var redisPubSub = require('models/redis/pubsub')

var log = logger.log

// express server, handles web HTTP requests
var apiServer = new ApiServer()

/**
 * @class
 */
function Api () {}

/**
 * - Listen to incoming HTTP requests
 * - Initialize datadog system monitoring
 * - Set self as "active api"
 * - Listen to all events (docker events from docks)
 * - Generate GitHub ssh keys
 * @param {Function} cb
 */
Api.prototype.start = function (cb) {
  cb = cb || error.logIfErr
  var count = createCount(callback)
  log.trace('start')
  // start github ssh key generator
  keyGen.start(count.inc().next)
  // start sending socket count
  dogstatsd.monitorStart()
  // connect to mongoose
  mongooseControl.start(count.inc().next)
  // express server start
  apiServer.start(count.inc().next)
  // all started callback
  function callback (err) {
    if (err) {
      log.error({
        err: err
      }, 'fatal error: API failed to start')
      error.log(err)
      if (cb) {
        cb(err)
      } else {
        process.exit(1)
      }
      return
    }
    log.trace('API started')
    cb()
  }
}

/**
 * Stop listening to requests and drain all current requests gracefully
 * @param {Function} cb
 */
Api.prototype.stop = function (cb) {
  log.trace('stop')
  cb = cb || error.logIfErr
  var count = createCount(closeDbConnections)
  // stop github ssh key generator
  keyGen.stop(count.inc().next)
  // stop sending socket count
  dogstatsd.monitorStop()
  // express server
  apiServer.stop(count.inc().next)

  function closeDbConnections (err) {
    if (!err) {
      // so far the stop was successful
      // finally disconnect from he databases
      var dbCount = createCount(cb)
      // FIXME: redis clients cannot be reconnected once they are quit this breaks the tests.
      if (!envIs('test')) {
        // disconnect from redis
        redisClient.quit()
        redisClient.on('end', dbCount.inc().next)
        redisPubSub.quit()
        redisPubSub.on('end', dbCount.inc().inc().next) // calls twice
      }
      var next = dbCount.inc().next
      mongooseControl.stop(function (err) {
        if (err) { return next(err) }
        next()
      })
      return
    }
    cb(err)
  }
}

// we are exposing here apiServer as a singletond
var api = module.exports = new Api()

api.start()

// should not occur in practice, using domains to catch errors
process.on('uncaughtException', function (err) {
  log.fatal({
    err: err
  }, 'stopping app due too uncaughtException')

  // hack to force loggly to release buffer
  for (var i = 0; i < process.env.BUNYAN_BATCH_LOG_COUNT; i++) {
    log.info('---')
  }

  error.log(err)
  var oldApi = api
  oldApi.stop(function () {
    log.trace('API stopped')
    process.exit(1)
  })
})
