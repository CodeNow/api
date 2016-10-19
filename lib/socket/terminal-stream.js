/**
 * Terminal stream handler
 * @module lib/socket/terminal-stream
 */
'use strict'
var commonStream = require('./common-stream')

var CircularBuffer = require('circular-buffer')
var DebugContainer = require('models/mongo/debug-container')
var Docker = require('models/apis/docker')
var error = require('dat-middleware').Boom
var Instance = require('models/mongo/instance')
var keypather = require('keypather')()
var logger = require('logger')
var moment = require('moment')
var monitorDog = require('monitor-dog')
var Promise = require('bluebird')
var PermissionService = require('models/services/permission-service')
var uuid = require('uuid')
var put = require('101/put')

module.exports.proxyStreamHandler = proxyStreamHandler

var baseDataName = 'api.socket.terminal'
var reqArgs = ['dockHost', 'type', 'containerId', 'terminalStreamId', 'eventStreamId']
var terminalConnections = {}

// Clean up old terminal connections
setInterval(handleCleanup, 1000 * 60 * 30)

// Expose for testing
module.exports._handleCleanup = handleCleanup
module.exports._terminalConnections = terminalConnections

function handleCleanup () {
  return Promise.map(Object.keys(terminalConnections), function (key) {
    var terminalConfig = terminalConnections[key]
    if (moment(terminalConfig.lastInteracted) < moment().subtract(4, 'hours')) {
      return terminalConnections[key].connection.then(function (connection) {
        connection.execStream.end()
        delete terminalConnections[key]
      })
    }
  })
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
  const tags = {
    containerId: data.containerId,
    isDebugContainer: data.isDebugContainer,
    eventStreamId: data.eventStreamId,
    terminalId: data.terminalId
  }
  const timer = monitorDog.timer(baseDataName + '.connections.userConnect', true, tags)
  var log = logger.child(put(tags, {
    sessionUser: sessionUser,
    terminalStreamId: data.terminalStreamId,
    method: 'TerminalStream.proxyStreamHandler'
  }))
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
      return PermissionService.ensureModelAccess(sessionUser, model)
    })
    .then(function () {
      timer.stop()
      return module.exports._setupStream(socket, data)
    })
    .catch(commonStream.onValidateFailure('proxyStreamHandler', socket, id, tags, timer))
}

module.exports._setupStream = function (socket, data) {
  var sessionUser = keypather.get(socket, 'request.sessionUser')
  var log = logger.child({
    containerId: data.containerId,
    terminalStreamId: data.terminalStreamId,
    isDebugContainer: data.isDebugContainer,
    eventStreamId: data.eventStreamId,
    sessionUser: sessionUser,
    terminalId: data.terminalId
  })
  const self = this

  log.info('TerminalStream._setupStream')
  var clientTermStream = socket.substream(data.terminalStreamId)
  var terminalId = data.terminalId || uuid.v4()
  function writeUserDataToTerminal (clientData) {
    if (terminalConnections[terminalId]) {
      // Track when the user last interacted so we can know when to kill the terminal
      terminalConnections[terminalId].lastInteracted = new Date()
      terminalConnections[terminalId].execStream.write(clientData)
    } else {
      log.warn('Attempt to write to a terminal that no longer exists. Ending client stream.')
      onSocketFailure()
    }
  }
  function onSocketFailure () {
    delete terminalConnections[terminalId]
    if (keypather.get(clientTermStream, 'stream.writable')) {
      // since the substream is still open, the user is still connected.  Let's reconnect them
      clientTermStream.off('data', writeUserDataToTerminal)
      module.exports._setupStream(socket, data)
    }
  }

  return Promise
    .try(() => {
      const connection = terminalConnections[terminalId]
      if (keypather.get(connection, 'containerId') === data.containerId) {
        if (!keypather.get(connection, 'execStream.readable')) {
          // The stream is toast
          delete terminalConnections[terminalId]
        } else {
          // A connection already exists!
          return terminalConnections[terminalId].execStream
        }
      }
      var docker = new Docker({ timeout: 1000 })
      return docker.execContainerAndRetryOnTimeoutAsync(data.containerId)
        .tap(execStream => {
          terminalConnections[terminalId] = {
            lastInteracted: new Date(),
            lastMessage: new CircularBuffer(100),
            containerId: data.containerId,
            execStream: execStream
          }
          monitorDog.captureStreamEvents(baseDataName + '.execStream', execStream)
        })
    })
    .tap(() => {
      socket.write({
        id: 1,
        event: 'TERMINAL_STREAM_CREATED',
        data: {
          terminalId: terminalId,
          substreamId: data.terminalStreamId
        }
      })
    })
    .then(execStream => {
      if (!terminalConnections[terminalId]) {
        return self._setupStream(socket, data)
      }
      const connection = terminalConnections[terminalId]
      const bufferStream = commonStream.connectStream(execStream, clientTermStream, log)
      connection.bufferStream = bufferStream
      // If there is a last message we want to restore it to the terminal (means a reconnect happened)
      while (connection.lastMessage.size()) {
        clientTermStream.write(connection.lastMessage.deq().toString())
      }
      execStream.once('error', function () {
        onSocketFailure()
      })

      // Listen for terminal output so we can handle restore nicely
      bufferStream.on('data', function (lastMessage) {
        // This also captures the user input!
        connection.lastMessage.enq(lastMessage)
      })

      // Handle user input
      clientTermStream.on('data', writeUserDataToTerminal)
      monitorDog.captureStreamEvents(baseDataName + '.clientTermStream', clientTermStream)
    })
}
