/**
 * Creates instance of http server, starts/stops
 * listening to requests
 * @module lib/server
 */
'use strict'

var createCounter = require('callback-count')
var fs = require('fs')
var http = require('http')
var https = require('https')

var logger = require('middlewares/logger')(__filename)
var rabbitMQ = require('models/rabbitmq')
var SocketServer = require('socket/socket-server.js')
var WorkerServer = require('worker-server.js')

var log = logger.log

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

/**
 * HTTP server begin listening for incoming HTTP requests
 * @param {Function} cb
 */
Server.prototype.start = function (cb) {
  log.info({}, 'Server.prototype.start')
  var self = this
  var counter = createCounter(cb)
  var options = {
    ca: fs.readFileSync('lib/certs/server.csr'),
    cert: fs.readFileSync('lib/certs/server.crt'),
    key: fs.readFileSync('lib/certs/server.key')
  }
  counter.inc()
  this.express.listen(process.env.PORT, function (err) {
    if (err) { return counter.next(err) }
    self.rabbitMQ.connect()
      .then(function () {
        if (process.env.IS_QUEUE_WORKER) {
          return WorkerServer.listen()
        }
        return
      })
      .then(function () {
        counter.next()
      })
      .catch(function (err) {
        counter.next(err)
      })
  })
  if (process.env.HTTPS) {
    https.createServer(options, this.app).listen(process.env.HTTPS_PORT || 443, counter.inc().next)
  }
  return this
}

/**
 * Cease listening for incoming HTTP requests
 * @param {Function} cb
 */
Server.prototype.stop = function (cb) {
  log.info({}, 'Server.prototype.stop')
  this.rabbitMQ.close()
    .then(function () {
      if (process.env.IS_QUEUE_WORKER) {
        return WorkerServer.stop().asCallback(cb)
      }
      return
    })
    .then(function () {
      this.express.close(cb)
    })
  return this
}
