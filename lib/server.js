/**
 * Creates instance of http server, starts/stops
 * listening to requests
 * @module lib/server
 */
'use strict'
const http = require('http')

const ErrorCat = require('error-cat')
const logger = require('middlewares/logger')(__filename)
const rabbitMQ = require('models/rabbitmq')
const SocketServer = require('socket/socket-server.js')
const WorkerServer = require('worker-server.js')

const log = logger.log

module.exports = Server

/**
 * Creates instance of Express and an HTTP server
 * @class
 * @return this
 */
function Server () {
  log.info('Server constructor')
  require('http').globalAgent.maxSockets = 1000
  require('https').globalAgent.maxSockets = 1000
  this.app = require('express-app')
  this.express = http.createServer(this.app)
  this.socketServer = new SocketServer(this.express)
  this.rabbitMQ = rabbitMQ
  return this
}

function handleUnhandledRejection (err) {
  ErrorCat.report(err)
  log.error({
    reason: err
  }, 'Unhandled rejection')
}

/**
 * HTTP server begin listening for incoming HTTP requests
 * @param {Function} cb
 */
Server.prototype.start = function (cb) {
  log.info('Server.prototype.start')
  var self = this

  // Handle bluebird unhandled promises and log them as unhandled rejections.
  process.on('unhandledRejection', handleUnhandledRejection)

  self.express.listen(process.env.PORT, function (err) {
    if (err) { return cb(err) }
    self.rabbitMQ.connect()
      .then(function () {
        if (process.env.IS_QUEUE_WORKER) {
          return WorkerServer.start()
        }
      })
      .asCallback(function (err) {
        cb(err)
      })
  })
  return self
}

/**
 * Cease listening for incoming HTTP requests
 * @param {Function} cb
 */
Server.prototype.stop = function (cb) {
  log.info({}, 'Server.prototype.stop')

  // Cleanup the listener
  process.removeListener('unhandledRejection', handleUnhandledRejection)

  var self = this
  self.rabbitMQ.disconnect()
    .then(function () {
      if (process.env.IS_QUEUE_WORKER) {
        return WorkerServer.stop()
      }
      return
    })
    .then(function () {
      log.trace('Server stopped')
      self.express.close(cb)
    })
  return self
}
