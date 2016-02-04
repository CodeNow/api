/**
 * @module lib/socket/socket-server
 */
'use strict'

var Primus = require('primus')
var domain = require('domain')
var envIs = require('101/env-is')
var keypather = require('keypather')()

var buildStream = require('socket/build-stream')
var dogstatsd = require('models/datadog')
var error = require('error')
var logStream = require('socket/log-stream')
var logger = require('middlewares/logger')(__filename)
var messenger = require('socket/messenger')
var passport = require('middlewares/passport')
var primusProxy = require('socket/terminal-stream')

module.exports = SocketServer

var baseDataName = 'api.socket.server'
var handlers = {}
var log = logger.log

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
    var primusDomain = domain.create()
    primusDomain.on('error', function onPrimusError (err) {
      log.error({
        tx: true,
        err: err
      }, 'socker-server: primusDomain error')
      error.socketErrorHandler(err, socket)
    })
    primusDomain.run(function () {
      // auth token used when we connect from other server
      var authToken = keypather.get(socket, 'request.query.token')
      // user id should exist when connecting from browser
      var userId = keypather.get(socket, 'request.session.passport.user')
      if (!userId && !authToken && !envIs('test')) {
        dogstatsd.increment(baseDataName + '.err.noUser')
        var error = new Error('Socker auth failed')
        log.error({ error: error}, 'socker-server: no auth for primus')
        return socket.write({
          error: 'not logged in, try again'
        })
      }
      dogstatsd.increment(baseDataName + '.connections')
      log.trace({
        tx: true,
        address: socket.address
      }, 'connection')
      function onSocketData (message) {
        /* message has to be structured like so
          {
            id: 1
            event: 'string'
            data: {object}
          }
        */
        if (!isDataValid(message)) {
          dogstatsd.increment(baseDataName + '.err.input')
          var error = new Error('Invalid stream subscription message', message)
          log.error({ err: error, message: message }, 'socker-server error input')
          return socket.write({
            error: 'invalid input',
            data: message
          })
        }
        // check events to ensure we support this one
        if (typeof handlers[message.event] !== 'function') {
          dogstatsd.increment(baseDataName + '.err.invalid_event', ['event:' + message.event])
          var error = new Error('Invalid socket server event', message)
          log.error({ error: error, message: message }, 'socker-server invalid event')
          return socket.write({
            error: 'invalid event',
            data: message
          })
        }
        dogstatsd.increment(baseDataName + '.event', ['event:' + message.event])
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
  if (message && message.id &&
    typeof message.event === 'string') {
    if (message.data && typeof message.data !== 'object') {
      return false
    }
    return true
  }
  return false
}
