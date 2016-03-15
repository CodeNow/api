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
var pump = require('substream-pump')
var through2 = require('through2')
var moment = require('moment')
var uuid = require('uuid')

module.exports.proxyStreamHandler = proxyStreamHandler

var baseDataName = 'api.socket.terminal'
var reqArgs = ['dockHost', 'type', 'containerId', 'terminalStreamId', 'eventStreamId']
var terminalConnections = {};

// Clean up old terminal connections
setInterval(function () {
  Object.keys(terminalConnections).forEach(function (key) {
    var terminalConfig = terminalConnections[key];
    if (moment(terminalConfig.lastInteracted) < moment().subtract('hours', 2)) {
      console.log('Killing terminal for being old');
      terminalConnections[key].rawStream.end();
      delete terminalConnections[key];
    }
  })
}, 1000 * 60)

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
      return commonStream.checkOwnership(sessionUser, model)
    })
    .then(function () {
      setupStream(socket, data)
    })
    .catch(commonStream.onValidateFailure('proxyStreamHandler', socket, id, logData))
}

function setupStream (socket, data) {
  var sessionUser = keypather.get(socket, 'request.sessionUser')
  var log = logger.log.child({
    tx: true,
    containerId: data.containerId,
    terminalStreamId: data.terminalStreamId,
    isDebugContainer: data.isDebugContainer,
    eventStreamId: data.eventStreamId,
    sessionUser: sessionUser
  })

  var clientTermStream = socket.substream(data.terminalStreamId)
  var terminalId = data.terminalId || uuid.v4();

  if (terminalConnections[terminalId]) {
    connectStream()
  } else {
    var docker = new Docker({ timeout: 0 })
    docker.execContainerAndRetryOnTimeout(data.containerId, function (err, execStream) {
      if (err) {
        log.error({ err: err }, 'exec container error')
        throw err
      }
      monitorDog.captureStreamEvents(baseDataName + '.execStream', execStream)
      var buff2String = through2({objectMode: true}, function transform(chunk, enc, cb) {
        if (chunk) {
          this.push(chunk.toString())
        }
        cb()
      })
      var streamCleanser = createStreamCleanser()
      var cleanedStream = execStream.pipe(streamCleanser).pipe(buff2String);
      terminalConnections[data.terminalId] = {
        cleanedStream: cleanedStream,
        rawStream: execStream,
        lastInteracted: new Date()
      }
      connectStream();
    })
  }
  function connectStream () {
    socket.write({
      id: 1,
      event: 'TERMINAL_STREAM_CREATED',
      data: {
        terminalId: terminalId,
        substreamId: data.terminalStreamId
      }
    })

    var cleanStream = terminalConnections[terminalId].cleanedStream
    cleanStream.pipe(clientTermStream)
    clientTermStream.on('data', function (clientData) {
      var terminalConfig = terminalConnections[terminalId];
      if (terminalConfig) {
        terminalConfig.lastInteracted = new Date();
        terminalConfig.rawStream.write(clientData);
      } else {
        log.warn('Attempt to write to a terminal that no longer exists. Ending client stream.')
        clientTermStream.end();
      }
    })
    monitorDog.captureStreamEvents(baseDataName + '.clientTermStream', clientTermStream)
  }
}
