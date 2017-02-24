/**
 * Terminal stream handler
 * @module lib/socket/terminal-stream
 */
'use strict'
const commonStream = require('./common-stream')

const CircularBuffer = require('circular-buffer')
const DebugContainer = require('models/mongo/debug-container')
const Docker = require('models/apis/docker')
const error = require('dat-middleware').Boom
const Instance = require('models/mongo/instance')
const keypather = require('keypather')()
const logger = require('logger')
const moment = require('moment')
const monitorDog = require('monitor-dog')
const Promise = require('bluebird')
const PermissionService = require('models/services/permission-service')
const uuid = require('uuid')
const put = require('101/put')
const rabbitMQ = require('models/rabbitmq')

module.exports.proxyStreamHandler = proxyStreamHandler

const baseDataName = 'api.socket.terminal'
const reqArgs = ['dockHost', 'type', 'containerId', 'terminalStreamId', 'eventStreamId']
const terminalConnections = {}

// Clean up old terminal connections
setInterval(handleCleanup, 1000 * 60 * 30)

// Expose for testing
module.exports._handleCleanup = handleCleanup
module.exports._terminalConnections = terminalConnections

function handleCleanup () {
  return Promise.map(Object.keys(terminalConnections), function (key) {
    const terminalConfig = terminalConnections[key]
    if (moment(terminalConfig.lastInteracted) < moment().subtract(4, 'hours')) {
      if (terminalConfig.execStream) {
        terminalConfig.execStream.end()
      }
      delete terminalConnections[key]
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
  const sessionUser = keypather.get(socket, 'request.sessionUser')
  const tags = {
    containerId: data.containerId,
    isDebugContainer: data.isDebugContainer,
    eventStreamId: data.eventStreamId,
    terminalId: data.terminalId
  }
  const timer = monitorDog.timer(baseDataName + '.connections.userConnect', true, tags)
  const log = logger.child(put(tags, {
    sessionUser,
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
    .tap(function (model) {
      if (!model) {
        const notFound = error.create(404, 'Missing model', data)
        notFound.report = false
        log.error({ err: notFound }, 'logHandler error: instance not found')
        throw notFound
      }
    })
    .tap(function (model) {
      return PermissionService.ensureModelAccess(sessionUser, model)
    })
    .then(function (model) {
      if (data.isDebugContainer) {
        return Instance.findByIdAsync(model.instance)
      }
      return model
    })
    .then(function (instance) {
      timer.stop()
      return module.exports._setupStream(socket, data, instance)
    })
    .catch(commonStream.onValidateFailure('proxyStreamHandler', socket, id, tags, timer))
}

module.exports._setupStream = function (socket, data, instance) {
  const instanceId = keypather.get(instance, '_id.toString()')
  const sessionUser = keypather.get(socket, 'request.sessionUser')
  const instanceOwnerGitHubId = keypather.get(instance, 'owner.github')
  const log = logger.child({
    containerId: data.containerId,
    terminalStreamId: data.terminalStreamId,
    isDebugContainer: data.isDebugContainer,
    eventStreamId: data.eventStreamId,
    sessionUser,
    terminalId: data.terminalId,
    instanceOwnerGitHubId,
    instanceId
  })
  const eventData = {
    container: {
      id: data.containerId,
      isDebug: data.isDebugContainer
    },
    instance,
    user: {
      gitHubId: keypather.get(sessionUser, 'accounts.github.id'),
      bigPoppaId: keypather.get(sessionUser, 'bigPoppaUser.id')
    },
    organization: {
      gitHubId: instanceOwnerGitHubId
    }
  }
  const self = this

  log.info('TerminalStream._setupStream')
  const clientTermStream = socket.substream(data.terminalStreamId)
  const terminalId = data.terminalId || uuid.v4()
  function writeUserDataToTerminal (clientData) {
    if (terminalConnections[terminalId]) {
      // Track when the user last interacted so we can know when to kill the terminal
      terminalConnections[terminalId].lastInteracted = new Date()
      terminalConnections[terminalId].execStream.write(clientData)
      rabbitMQ.publishTerminalDataSent(eventData)
    } else {
      log.warn('Attempt to write to a terminal that no longer exists. Ending client stream.')
      onSocketFailure()
    }
  }
  function onSocketFailure () {
    delete terminalConnections[terminalId]
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
      const docker = new Docker({ timeout: 0 })
      return docker.execContainerAndRetryOnTimeoutAsync(data.containerId)
        .tap(execStream => {
          terminalConnections[terminalId] = {
            lastInteracted: new Date(),
            lastMessage: new CircularBuffer(process.env.DOCKER_TERMINAL_BUFFER),
            containerId: data.containerId,
            execStream
          }
          monitorDog.captureStreamEvents(baseDataName + '.execStream', execStream)
        })
    })
    .tap(() => {
      socket.write({
        id: 1,
        event: 'TERMINAL_STREAM_CREATED',
        data: {
          terminalId,
          substreamId: data.terminalStreamId
        }
      })
      rabbitMQ.publishTerminalConnected(eventData)
    })
    .then(execStream => {
      if (!terminalConnections[terminalId]) {
        return self._setupStream(socket, data)
      }
      const connection = terminalConnections[terminalId]
      if (connection.bufferStream) {
        // if there is already a bufferStream, remove the listener
        connection.bufferStream.removeListener('data', queueLastMessage)
      }
      const bufferStream = commonStream.connectStream(execStream, clientTermStream, log)

      connection.bufferStream = bufferStream
      if (connection.clientTermStream) {
        // if there is already a bufferStream, remove the listener
        connection.clientTermStream.removeListener('data', writeUserDataToTerminal)
      }
      connection.clientTermStream = clientTermStream

      execStream.once('error', onSocketFailure)
      // reverse the queue, since it's FIFO
      const messageHistory = connection.lastMessage.toarray().reverse().join('')
      // If there are messages in the queue, write them to the client
      clientTermStream.write(messageHistory)

      function queueLastMessage (lastMessage) {
        // This also captures the user input!
        connection.lastMessage.enq(lastMessage)
      }
      // Listen for terminal output so we can handle restore nicely
      bufferStream.on('data', queueLastMessage)

      // Handle user input
      clientTermStream.on('data', writeUserDataToTerminal)
      monitorDog.captureStreamEvents(baseDataName + '.clientTermStream', clientTermStream)
    })
}
