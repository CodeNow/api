/**
 * @module lib/socket/build-stream/
 */
'use strict'
var dockerModem = require('docker-modem')
var domain = require('domain')
var isObject = require('101/is-object')
var JSONStream = require('JSONStream')
var keypather = require('keypather')()
var monitorDog = require('monitor-dog')
var objectId = require('objectid')
var TCA = require('tailable-capped-array')
var uuid = require('uuid')

var commonStream = require('socket/common-stream')
var ContextVersion = require('models/mongo/context-version')
var Docker = require('models/apis/docker')
var error = require('error')
var logger = require('logger')
var PermissionService = require('models/services/permission-service')

var baseDataName = 'api.socket.build-stream'
var reqArgs = ['id', 'streamId']

module.exports = {
  BuildStream: BuildStream,
  buildStreamHandler: function (socket, id, data) {
    var buildStream = new BuildStream(socket, id, data)
    return buildStream.handleStream()
  }
}

/**
 * Handle client-initiated request for a build-stream
 * @param {Object} socket
 * @param {String} id
 * @param {Object} data
 * @returns {null}
 */
function BuildStream (socket, id, data) {
  this.socket = socket
  this.id = id
  this.data = data
  this.sessionUser = keypather.get(socket, 'request.sessionUser')

  monitorDog.increment(baseDataName + '.connections')
}

function createJSONParser (client, onErr) {
  onErr = onErr || function () {}
  var jsonParser = JSONStream.parse()
  jsonParser.on('root', onRootEvent)
  jsonParser.on('error', onErrorEvent)
  jsonParser.on('end', onEndEvent)
  jsonParser.on('data', onData)

  // Preserve last 10 data items for inspection if error
  var data = new TCA(10)
  function onData (_data) {
    data.push(_data)
  }
  function onRootEvent (data) {
    if (!isObject(data)) { data = {} }
    client.write(data)
  }
  function onErrorEvent (jsonParseErr) {
    jsonParser.removeListener('root', onRootEvent)
    jsonParser.removeListener('error', onErrorEvent)
    jsonParser.removeListener('end', onEndEvent)
    logger.warn({
      err: jsonParseErr,
      streamData: data.toArray()
    }, 'createJSONParser onErrorEvent')
    onErr('json parse failed to read build logs: ' + jsonParseErr.message)
  }
  function onEndEvent () {
    client.end()
  }

  return jsonParser
}

BuildStream.prototype.handleStream = function () {
  var logData = {
    sessionUser: this.sessionUser,
    id: this.data.id,
    method: 'ContainerImageBuilderDied'
  }
  var log = logger.child(logData)
  log.info('BuildStream.prototype.handleStream called')
  var sessionUser = this.sessionUser

  return commonStream.validateDataArgs(this.data, reqArgs)
    .bind(this)
    .then(function () {
      return ContextVersion.findOneAsync({ _id: objectId(this.data.id) })
    })
    .then(function (version) {
      if (!version) {
        throw new Error('Missing context version')
      } else if (this._validateVersion(version)) {
        throw new Error('Invalid context version')
      }
      return version
    })
    .tap(function (version) {
      return PermissionService.isOwnerOf(sessionUser, version)
    })
    .then(function (version) {
      // Grab the stream from the socket using the containerId
      var clientStream = this.socket.substream(this.data.streamId)
      monitorDog.captureStreamEvents(baseDataName + '.client', clientStream)
      // check if build already completed
      if (version.build && version.build.completed && version.build.log) {
        log.trace('build already built')
        // writeLogsToPrimusStream will take care of splitting strings and writing to primus
        // with objects, or it will simply use the objects in the db
        return version.writeLogsToPrimusStream(clientStream)
      }
      this._pipeBuildLogsToClient(version, clientStream)
    })
    .catch(commonStream.onValidateFailure('buildStream', this.socket, this.data.streamId, logData))
}

BuildStream.prototype._writeErr = function (errMessage, version) {
  logger.trace({
    errMessage: errMessage
  }, 'BuildStream.prototype._writeErr')
  if (this.socket.writable) {
    this.socket.write({
      id: this.id,
      error: errMessage,
      data: version
    })
  }
  return true
}

BuildStream.prototype._validateVersion = function (version) {
  logger.trace('BuildStream.prototype._validateVersion')
  return !keypather.get(version, 'build.dockerContainer')
}

BuildStream.prototype._pipeBuildLogsToClient = function (version, clientStream) {
  var self = this
  var log = logger.child({
    method: 'BuildStream.prototype._pipeBuildLogsToClient',
    version: version._id,
    dockerContainer: keypather.get(version, 'build.dockerContainer')
  })
  log.info('BuildStream.prototype._pipeBuildLogsToClient called')
  var docker = new Docker()
  // make sure client stream is still writable
  if (!clientStream.stream) { return }
  docker.getLogs(version.build.dockerContainer, function (err, dockerLogStream) {
    if (err) { return writeLogError(err) }
    var pipeDomain = domain.create()

    /**
     * For trace logging w/ bunyan
     */
    var runnableData = keypather.get(process, 'domain.runnableData')
    if (runnableData) {
      pipeDomain.runnableData = runnableData
    } else {
      pipeDomain.runnableData = {
        tid: uuid.v4(),
        reqStart: new Date()
      }
    }

    pipeDomain.on('error', function (err) {
      log.fatal({ err: err }, 'domain err')
      error.log(err)
    })
    pipeDomain.run(function () {
      log.trace('begin pipe job')
      var jsonParser = createJSONParser(clientStream, writeLogError)
      // Don't call end, at least for now
      // The substream will end when the user disconnects
      // TODO: Change to docker.docker.modem.demuxStream once https://github.com/apocas/docker-modem/pull/60 is merged
      // and remove docker-modem dependency
      dockerModem.prototype.demuxStream(dockerLogStream, jsonParser, jsonParser)
      dockerLogStream.on('end', function () {
        clientStream.end()
      })
      monitorDog.captureStreamEvents(baseDataName + '.docker-logs', dockerLogStream)
    })
  })
  function writeLogError (err) {
    log.trace({ err: err }, 'error writing to logs')
    monitorDog.increment(baseDataName + '.err.getting_build_logs', ['dockerHost:' + version.dockerHost])
    error.log(err)
    return self._writeErr(err.messsage, version)
  }
}
