/**
 * @module lib/socket/socket-server
 */
'use strict'

var domain = require('domain')
var envIs = require('101/env-is')
var keypather = require('keypather')()
var Primus = require('primus')
var put = require('101/put')

var buildStream = require('socket/build-stream')
var monitorDog = require('monitor-dog')
var error = require('error')
var log = require('middlewares/logger')(__filename).log
var logStream = require('socket/log-stream')
var messenger = require('socket/messenger')
var passport = require('middlewares/passport')
var primusProxy = require('socket/terminal-stream')

module.exports = SocketServer

var baseDataName = 'socket.server'
var handlers = {}

/**
 * Orchestrate primus/socket API functionality (build logs, container logs, etc)
 * @class
 * @param {String} server
 * @return null
 */
function SocketServer (server) {
  if (!server) {
    throw new Error('no server passed into socket creator')
  }
  var options = {
    redis: {
      host: process.env.REDIS_IPADDRESS,
      port: process.env.REDIS_PORT
    },
    transformer: process.env.PRIMUS_TRANSFORMER,
    origins: (envIs('production') ? process.env.DOMAIN : '*')
  }
  this.primus = new Primus(server, options)
  messenger.setServer(this.primus)

  this.primus.use('redis', require('primus-redis-rooms'))
  this.primus.use('substream', require('substream'))
  this.primus.before(require('middlewares/session'))
  this.primus.before(passport.initialize({ userProperty: 'sessionUser' }))
  this.primus.before(passport.session())

  /**
   * To give these handlers the functionality to (at any time) throw some error and cause cleanup,
   * these have been made into Promises.  They should throw an error if an unauthenticated
   * connection is detected
   */
  this.addHandler('build-stream', buildStream.buildStreamHandler)
  this.addHandler('log-stream', logStream.logStreamHandler)
  this.addHandler('terminal-stream', primusProxy.proxyStreamHandler)
  this.addHandler('subscribe', messenger.subscribeStreamHandler.bind(messenger))
  // handle connection
  // wrap event listeners in domain for error handling
  this.primus.on('connection', function (socket) {
    var logData = { address: socket.address }
    log.info(logData, 'socker-server: connection')
    var primusDomain = domain.create()
    primusDomain.on('error', function onPrimusError (err) {
      log.error(put({ err: err }, logData), 'socker-server: primusDomain error')
      error.socketErrorHandler(err, socket)
    })
    primusDomain.run(function () {
      // auth token used when we connect from other server
      var authToken = keypather.get(socket, 'request.query.token')
      // user id should exist when connecting from browser
      var userId = keypather.get(socket, 'request.session.passport.user')
      log.trace(put({ authToken: authToken, userId: userId }, logData), 'socker-server: auth check')
      if (!userId && !authToken && !envIs('test')) {
        monitorDog.increment(baseDataName + '.err.noUser')
        var noAuthError = new Error('Socker auth failed')
        log.error({ error: noAuthError }, 'socker-server: no auth for primus')
        return socket.write({
          error: 'not logged in, try again'
        })
      }
      monitorDog.increment(baseDataName + '.connections')
      function onSocketData (message) {
        /* message has to be structured like so
          {
            id: 1
            event: 'string'
            data: {object}
          }
        */
        if (!isDataValid(message)) {
          monitorDog.increment(baseDataName + '.err.input')
          var invalidStreamError = new Error('Invalid stream subscription message', message)
          log.error({ err: invalidStreamError, message: message }, 'socker-server: error input')
          return socket.write({
            error: 'invalid input',
            data: message
          })
        }
        // check events to ensure we support this one
        if (typeof handlers[message.event] !== 'function') {
          monitorDog.increment(baseDataName + '.err.invalid_event', ['event:' + message.event])
          var invalidEventError = new Error('Invalid socket server event', message)
          log.error({ error: invalidEventError, message: message }, 'socker-server: invalid event')
          return socket.write({
            error: 'invalid event',
            data: message
          })
        }
        monitorDog.increment(baseDataName + '.event', ['event:' + message.event])
        // run handler once all is good
        primusDomain.run(function () {
          handlers[message.event](socket, message.id, message.data)
            .catch(error.log)
        })
      }
      socket.on('data', onSocketData)
    })
  })
  var primus = this.primus
  server.on('close', function () {
    primus.rooms.redis.pub.quit()
    primus.rooms.redis.sub.quit()
  })
}

/** socket handlers have type and func
  type has to be a string.
  on a message if type matches event name the function is called
  func must be a function which has arguments like so
  func(socket, id, message.data)
  messages on the main socket stream must be of form
  {
    id: 1
    event: 'string'
    data: {object}
  }
*/
SocketServer.prototype.addHandler = function (type, func) {
  handlers[type] = func
}

SocketServer.prototype.removeHandler = function (type) {
  delete handlers[type]
}

/**
 * Is incoming message formatted properly for event subscription
 * @param {Object|String} message
 * @return Boolean
 */
function isDataValid (message) {
  if (message && (message.id || message.containerId) && typeof message.event === 'string') {
    if (message.data && typeof message.data !== 'object') {
      return false
    }
    return true
  }
  return false
}
