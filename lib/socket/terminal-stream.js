/**
 * Terminal stream handler
 * @module lib/socket/terminal-stream
 */
'use strict'

var commonStream = require('./common-stream')

var createStreamCleanser = require('docker-stream-cleanser')
var DebugContainer = require('models/mongo/debug-container')
var Docker = require('models/apis/docker')
var ErrorCat = require('error-cat')
var error = new ErrorCat()
var Instance = require('models/mongo/instance')
var keypather = require('keypather')()
var logger = require('middlewares/logger')(__filename)
var monitorDog = require('monitor-dog')
var through2 = require('through2')
var moment = require('moment')
var uuid = require('uuid')
var Promise = require('bluebird')

module.exports.proxyStreamHandler = proxyStreamHandler

var baseDataName = 'api.socket.terminal'
var reqArgs = ['dockHost', 'type', 'containerId', 'terminalStreamId', 'eventStreamId']
var terminalConnections = {}

// Clean up old terminal connections
setInterval(handleCleanup, 1000 * 60)

// Expose for testing
module.exports._handleCleanup = handleCleanup
module.exports._terminalConnections = terminalConnections

function handleCleanup () {
  return Promise.all(
    Object.keys(terminalConnections).map(function (key) {
      var terminalConfig = terminalConnections[key]
      if (moment(terminalConfig.lastInteracted) < moment().subtract(2, 'hours')) {
        return terminalConnections[key].connection.then(function (connection) {
          connection.execStream.end()
          delete terminalConnections[key]
        })
      }
    })
  )
}

/** proxy stream to destination
  dockHost = host dock formatted like http://192.16.13.5:9123
  type = what you are connecting to
  containerId = of the container you wish to connect to
  terminalStreamId = ID of terminal substeam to create
  clientStreamId = ID of client substream to create
*/
function proxyStreamHandler (socket, id, data) {
  data.terminalId = data.terminalId || uuid.v4()
  monitorDog.increment(baseDataName + '.connections')
  // check required args
  var sessionUser = keypather.get(socket, 'request.sessionUser')
  var logData = {
    tx: true,
    containerId: data.containerId,
    terminalStreamId: data.terminalStreamId,
    isDebugContainer: data.isDebugContainer,
    eventStreamId: data.eventStreamId,
    sessionUser: sessionUser,
    terminalId: data.terminalId
  }
  var log = logger.log.child(logData)
  log.info('TerminalStream.proxyStreamHandler')

  return commonStream.validateDataArgs(data, reqArgs)
    .then(function () {
      if (data.isDebugContainer) {
        return DebugContainer.findOneAsync({ 'inspect.dockerContainer': data.containerId })
      } else {
        return Instance.findOneAsync({ 'container.dockerContainer': data.containerId })
      }
    })
    .then(function (model) {
      if (!model) {
        var notFound = error.create(404, 'Missing model', data)
        notFound.report = false
        log.error({ err: notFound }, 'logHandler error: instance not found')
        throw notFound
      }
      return model
    })
    .then(function (model) {
      console.log('Checking ownership?')
      return commonStream.checkOwnership(sessionUser, model)
    })
    .then(function () {
      return module.exports._setupStream(socket, data)
    })
    .catch(commonStream.onValidateFailure('proxyStreamHandler', socket, id, logData))
}

module.exports._setupStream = Promise.method(function (socket, data) {
  var sessionUser = keypather.get(socket, 'request.sessionUser')
  var log = logger.log.child({
    tx: true,
    containerId: data.containerId,
    terminalStreamId: data.terminalStreamId,
    isDebugContainer: data.isDebugContainer,
    eventStreamId: data.eventStreamId,
    sessionUser: sessionUser,
    terminalId: data.terminalId
  })

  log.info('TerminalStream._setupStream')
  var clientTermStream = socket.substream(data.terminalStreamId)
  var terminalId = data.terminalId || uuid.v4()

  return Promise.resolve()
    .then(function () {
      if (terminalConnections[terminalId]) {
        // A connection already exists!
        return terminalConnections[terminalId].connection
      }

      var docker = new Docker({ timeout: 0 })
      terminalConnections[terminalId] = {
        lastInteracted: new Date()
      }

      // No connection exists, set one up
      terminalConnections[terminalId].connection = docker.execContainerAndRetryOnTimeoutAsync(data.containerId)
        .then(function (execStream) {
          monitorDog.captureStreamEvents(baseDataName + '.execStream', execStream)
          var buff2String = through2({ objectMode: true }, function transform (chunk, enc, cb) {
            if (chunk) {
              this.push(chunk.toString())
            }
            cb()
          })
          var streamCleanser = createStreamCleanser()

          // Return all the data we will need later to validate this connection and to use it
          return {
            containerId: data.containerId,
            cleanedExecStream: execStream.pipe(streamCleanser).pipe(buff2String),
            execStream: execStream,
            lastMessage: null
          }
        })
      return terminalConnections[terminalId].connection
    })
    .then(function (connection) {
      if (connection.containerId !== data.containerId) {
        var err = error.create(401, 'You are not authorized to access this stream.')
        log.warn({ err: err }, 'terminalStream _setupStream Unauthorized attempt to access stream.')
        throw err
      }
      return connection
    })
    .then(function (connection) {
      socket.write({
        id: 1,
        event: 'TERMINAL_STREAM_CREATED',
        data: {
          terminalId: terminalId,
          substreamId: data.terminalStreamId
        }
      })

      // If there is a last message we want to restore it to the terminal (means a reconnect happened)
      if (connection.lastMessage) {
        clientTermStream.write(connection.lastMessage)
      }
      // Send terminal output to the user
      connection.cleanedExecStream.pipe(clientTermStream)

      // Listen for terminal output so we can handle restore nicely
      connection.cleanedExecStream.on('data', function (lastMessage) {
        connection.lastMessage = lastMessage
      })

      // Handle user input
      clientTermStream.on('data', function (clientData) {
        if (terminalConnections[terminalId]) {
          // Track when the user last interacted so we can know when to kill the terminal
          terminalConnections[terminalId].lastInteracted = new Date()
          connection.execStream.write(clientData)
        } else {
          log.warn('Attempt to write to a terminal that no longer exists. Ending client stream.')
          clientTermStream.end()
        }
      })
      monitorDog.captureStreamEvents(baseDataName + '.clientTermStream', clientTermStream)
    })
})
