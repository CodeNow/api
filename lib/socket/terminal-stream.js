/**
 * Terminal stream handler
 * @module lib/socket/terminal-stream
 */
'use strict'

var commonStream = require('./common-stream')
var DebugContainer = require('models/mongo/debug-container')
var Docker = require('models/apis/docker')
var dockerModem = require('docker-modem')
var Instance = require('models/mongo/instance')
var keypather = require('keypather')()
var log = require('middlewares/logger')(__filename).log
var Primus = require('primus')

var monitorDog = require('monitor-dog')

module.exports.proxyStreamHandler = proxyStreamHandler

var baseDataName = 'api.socket.terminal'
var reqArgs = ['dockHost', 'type', 'containerId', 'terminalStreamId', 'eventStreamId']
var Socket = Primus.createSocket({
  transformer: process.env.PRIMUS_TRANSFORMER,
  plugin: {
    'substream': require('substream')
  },
  parser: 'JSON'
})

/** proxy stream to destination
  dockHost = host dock formatted like http://192.16.13.5:9123
  type = what you are connecting to
  containerId = of the container you wish to connect to
  terminalStreamId = ID of terminal substeam to create
  clientStreamId = ID of client substream to create
*/
function proxyStreamHandler (socket, id, data) {
  monitorDog.increment(baseDataName + '.connections')
  // check required args
  var sessionUser = keypather.get(socket, 'request.sessionUser')
  var logData = {
    tx: true,
    containerId: data.containerId,
    terminalStreamId: data.terminalStreamId,
    isDebugContainer: data.isDebugContainer,
    eventStreamId: data.eventStreamId,
    sessionUser: sessionUser
  }
  log.info(logData, 'TerminalStream.proxyStreamHandler')

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
        throw new Error('Missing model')
      }
      return model
    })
    .then(function (model) {
      return commonStream.checkOwnership(sessionUser, model)
    })
    .then(function () {
      setupStream(socket, id, data)
    })
    .catch(commonStream.onValidateFailure('proxyStreamHandler', socket, id, logData))
}

function setupStream (socket, id, data) {
  var clientTermStream = socket.substream(data.terminalStreamId)
  var docker = new Docker()

  docker.execContainer(data.containerId, function (err, execStream) {
    if (err) { throw err }
    log.trace('terminal stream execStream setup')
    // TODO: Change to docker.docker.modem.demuxStream once https://github.com/apocas/docker-modem/pull/60 is merged
    // and remove docker-modem dependency
    dockerModem.prototype.demuxStream(execStream, clientTermStream, clientTermStream)
    // docker.docker.modem.demuxStream(execStream, clientTermStream, clientTermStream)
    clientTermStream.on('data', function (d) {
      log.trace({ data: d, dd: d.toString() }, 'terminal stream event from client')
      execStream.write(d.toString())
    })

    monitorDog.captureStreamEvents(baseDataName + '.clientTermStream', clientTermStream)
    monitorDog.captureStreamEvents(baseDataName + '.execStream', execStream)

    execStream.on('open', function () {
      log.trace('terminal stream execStream open')
      socket.write({
        id: id,
        event: 'TERM_STREAM_CREATED',
        data: {
          substreamId: data.containerId
        }
      })
    })
  })
}
