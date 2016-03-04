/**
 * Terminal stream handler
 * @module lib/socket/terminal-stream
 */
'use strict'

var commonStream = require('./common-stream')

var createStreamCleanser = require('docker-stream-cleanser')
var DebugContainer = require('models/mongo/debug-container')
var Docker = require('models/apis/docker')
var Instance = require('models/mongo/instance')
var keypather = require('keypather')()
var log = require('middlewares/logger')(__filename).log
var monitorDog = require('monitor-dog')
var pump = require('substream-pump')
var through = require('through')

module.exports.proxyStreamHandler = proxyStreamHandler

var baseDataName = 'api.socket.terminal'
var reqArgs = ['dockHost', 'type', 'containerId', 'terminalStreamId', 'eventStreamId']

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
    log.trace({ containerId: data.containerId }, 'terminal stream execStream setup')
    var buff2String = through(function write (data) {
      if (data) {
        this.queue(data.toString())
      }
    })
    var streamCleanser = createStreamCleanser()
    pump(execStream.pipe(streamCleanser).pipe(buff2String), clientTermStream)
    clientTermStream.on('data', execStream.write)

    monitorDog.captureStreamEvents(baseDataName + '.clientTermStream', clientTermStream)
    monitorDog.captureStreamEvents(baseDataName + '.execStream', execStream)
  })
}
