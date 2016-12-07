/**
 * @module lib/key-generator
 */
'use strict'

require('loadenv')()

var async = require('async')

var Keypair = require('models/mongo/keypair')
var dogstatsd = require('models/datadog')
var logger = require('middlewares/logger')(__filename)
var noop = require('101/noop')
var bindAll = require('101/bind-all')

var log = logger.log

function KeyGen (poolSize, timeInterval) {
  this.poolSize = poolSize
  this.timeInterval = timeInterval
  this.intervalRunning = false
  this.intervalStopHandlers = []
  // bind any handlers
  bindAll(this, [
    '_handleInterval',
    '_handleIntervalComplete'
  ])
}

// inherits from event emitter
require('util').inherits(KeyGen, require('events').EventEmitter)

/*
 * start key generations
 */
KeyGen.prototype.start = function (cb) {
  cb = cb || noop
  if (this.stopAfterIntervalCompletes) {
    // interval is running and stop was requested
    // delete the stop request and continue.
    delete this.stopAfterIntervalCompletes
    // fake stop and just keep same interval
    return this.emit('stop')
  }
  if (this.interval) {
    // interval is already running
    return process.nextTick(cb)
  }
  this.interval = setInterval(this._handleInterval, this.timeInterval)
  return process.nextTick(cb)
}

/*
 * stop key generations
 */
KeyGen.prototype.stop = function (cb) {
  cb = cb || noop
  if (!this.interval) {
    // already stopped
    return process.nextTick(cb)
  }
  if (this.intervalRunning) {
    this.stopAfterIntervalCompletes = true
    return this.on('stop', cb)
  } else { // !intervalRunning
    this._stopInterval()
    return process.nextTick(cb)
  }
}

/*
 * stop interval and emit 'stop'
 */
KeyGen.prototype._stopInterval = function (err) {
  clearInterval(this.interval)
  delete this.interval
  this.emit('stop', err)
}

/*
 * handle the interval. determining keys needed and create them
 */
KeyGen.prototype._handleInterval = function () {
  var self = this
  this.intervalRunning = true
  var handleComplete = this._handleIntervalComplete
  Keypair.getRemainingKeypairCount(function (err, count) {
    if (err) {
      log.error({err: err}, 'error getting the keypair count')
      return handleComplete(err)
    }
    dogstatsd.gauge('api.keypairs.count', count)
    var numKeysToCreate = self.poolSize - count
    var tasks = []
    for (var i = 0; i < numKeysToCreate; i++) {
      tasks.push(Keypair.createKeypair.bind(Keypair))
    }
    async.parallel(tasks, handleComplete)
  })
}

/*
 * handle interval completion
 */
KeyGen.prototype._handleIntervalComplete = function (err) {
  delete this.intervalRunning
  if (this.stopAfterIntervalCompletes) {
    delete this.stopAfterIntervalCompletes
    this._stopInterval()
  }
  if (err) {
    log.error({err: err}, 'error creating keypairs')
  }
}

module.exports = new KeyGen(process.env.GITHUB_DEPLOY_KEYS_POOL_SIZE, 60 * 1000)
