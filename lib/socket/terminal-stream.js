/**
 * TODO document
 * @module lib/socket/terminal-stream
 */
'use strict'

var commonStream = require('./common-stream')
var DebugContainer = require('models/mongo/debug-container')
var Instance = require('models/mongo/instance')
var keypather = require('keypather')()
var log = require('middlewares/logger')(__filename).log
var pump = require('substream-pump')

var dogstatsd = require('models/datadog')
var Docker = require('models/apis/docker.js')

module.exports.proxyStreamHandler = proxyStreamHandler

var baseDataName = 'api.socket.terminal'
var reqArgs = ['containerId', 'terminalStreamId', 'eventStreamId']

function proxyStreamHandler (socket, id, data) {
  dogstatsd.increment(baseDataName + '.connections')
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
  var clientEventStream = socket.substream(data.eventStreamId)

  var docker = new Docker()
  docker.execContainer(data.containerId, function (err, destStream) {
    if (err) { throw err }

    var destTermStream = destStream.substream('terminal')
    var destEventStream = destStream.substream('clientEvents')

    pump(clientTermStream, destTermStream)
    pump(clientEventStream, destEventStream)
    pump(destTermStream, clientTermStream)
    pump(destEventStream, clientEventStream)

    pump(socket, destStream)

    dogstatsd.captureSteamData(baseDataName + '.clientTermStream', clientTermStream)
    dogstatsd.captureSteamData(baseDataName + '.destTermStream', destTermStream)
    dogstatsd.captureSteamData(baseDataName + '.clientEventStream', clientEventStream)
    dogstatsd.captureSteamData(baseDataName + '.destEventStream', destEventStream)

    destStream.on('open', function () {
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
