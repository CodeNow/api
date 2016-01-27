/**
 * @module lib/models/apis/timers
 */
'use strict'

var isFunction = require('101/is-function')

var dogstatsd = require('models/datadog')
var logger = require('middlewares/logger')(__filename)

var log = logger.log

module.exports = Timers

function Timers () {
  this.timers = {}
}

Timers.prototype.debug = function (name, message) {
  log.trace({
    tx: true,
    name: name,
    message: message
  }, 'Timers.prototype.debug')
}

Timers.prototype.sendToDatadog = function (name, timer, tags) {
  var ms = (timer[0] * 1000) + (timer[1] / 1000000)
  // ms = seconds * 1000 + nanoseconds / 1000000
  dogstatsd.timing('api.timers.' + name, ms, tags)
}

Timers.prototype.startTimer = function (name, cb) {
  if (isFunction(name)) {
    cb = name
    return cb(new Error('timers require a name'))
  }
  if (this.timers[name]) {
    this.debug(name, 'timer has already been started')
    return cb(new Error('timer ' + name + ' already exists'))
  }
  this.timers[name] = process.hrtime()
  cb()
}

Timers.prototype.stopTimer = function (name, tags, cb) {
  if (isFunction(name)) {
    cb = name
    return cb(new Error('timers require a name'))
  }
  if (isFunction(tags)) {
    cb = tags
    tags = []
  }
  tags.push('node_env:' + process.env.NODE_ENV)
  if (!this.timers[name]) {
    this.debug(name, 'timer does not exist')
    return cb(new Error('timer ' + name + ' does not exist'))
  }
  var stop = process.hrtime(this.timers[name])

  this.debug(name, stop[0] + 's, ' + stop[1] / 1000000 + 'ms')
  this.sendToDatadog(name, stop, tags)
  delete this.timers[name]
  cb(null, stop)
}
