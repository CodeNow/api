/**
 * TODO document
 * @module lib/socket/terminal-stream
 */
'use strict'

var commonStream = require('./common-stream')
var DebugContainer = require('models/mongo/debug-container')
var error = require('error')
var Instance = require('models/mongo/instance')
var keypather = require('keypather')()
var log = require('middlewares/logger')(__filename).log
var Primus = require('primus')
var Promise = require('bluebird')
var pump = require('substream-pump')
var url = require('url')

var dogstatsd = require('models/datadog')

module.exports.proxyStreamHandler = proxyStreamHandler

var baseDataName = 'api.socket.terminal'
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
  dogstatsd.increment(baseDataName + '.connections')
  // check required args
  if (!data.dockHost ||
    !data.type ||
    !data.containerId ||
    !data.terminalStreamId ||
    !data.eventStreamId) {
    var err = new Error('dockHost, type, containerId, ' +
      'terminalStreamId, clientStreamId, are required')
    socket.write({
      id: id,
      error: err.message,
      data: data
    })
    error.log(err)
    var rejectionPromise = Promise.reject(err)
    rejectionPromise.suppressUnhandledRejections()
    return rejectionPromise
  }
  var sessionUser = keypather.get(socket, 'request.sessionUser')
  var logData = {
    tx: true,
    containerId: data.containerId,
    terminalStreamId: data.terminalStreamId,
    isDebugContainer: data.isDebugContainer,
    sessionUser: sessionUser
  }
  log.info(logData, 'TerminalStream.proxyStreamHandler')

  var promise = (data.isDebugContainer) ? DebugContainer.findOneAsync({ 'inspect.dockerContainer': data.containerId })
    : Instance.findOneAsync({ 'container.dockerContainer': data.containerId })

  return promise
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
    .catch(commonStream.onValidateFailure('proxyStreamHandler', socket, logData))
}

function setupStream (socket, id, data) {
  var clientTermStream = socket.substream(data.terminalStreamId)
  var clientEventStream = socket.substream(data.eventStreamId)

  var parsedHost = url.parse(data.dockHost)
  var destStream = new Socket('http://' +
    parsedHost.hostname +
    ':' +
    process.env.FILIBUSTER_PORT +
    '?type=' + data.type +
    '&args=' + JSON.stringify(data))

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
}
