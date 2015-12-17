/**
 * @module lib/socket/build-stream/
 */
'use strict'

var dockerStreamCleanser = require('docker-stream-cleanser')
var JSONStream = require('JSONStream')
var isObject = require('101/is-object')

var ContextVersion = require('models/mongo/context-version')
var Docker = require('models/apis/docker')
var dogstatsd = require('models/datadog')
var error = require('error')
var logger = require('middlewares/logger')(__filename)
var domain = require('domain')
var put = require('101/put')

var baseDataName = 'api.socket.build'
var log = logger.log

// module.exports.buildStreamHandler = buildStream
module.exports = {
  BuildStream: BuildStream,
  buildStreamHandler: function (socket, id, data) {
    var buildStream = new BuildStream(socket, id, data)
    buildStream.handleStream()
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
  dogstatsd.increment(baseDataName + '.connections')
  // check required args
  if (!data.id || !data.streamId) {
    dogstatsd.increment(baseDataName + '.err.invalid_args')
    return this._writeErr('data.id and data.streamId are required')
  }
}

function createJSONParser (client, onErr) {
  onErr = onErr || function () {}
  var jsonParser = JSONStream.parse()
  jsonParser.on('root', onRootEvent)
  jsonParser.on('error', onErrorEvent)
  jsonParser.on('end', onEndEvent)

  function onRootEvent (data) {
    if (!isObject(data)) { data = {} }
    client.write(data)
  }
  function onErrorEvent (jsonParseErr) {
    jsonParser.removeListener('root', onRootEvent)
    jsonParser.removeListener('error', onErrorEvent)
    jsonParser.removeListener('end', onEndEvent)
    onErr('json parse failed to read build logs: ' + jsonParseErr.message)
  }
  function onEndEvent () { client.end() }

  return jsonParser
}

BuildStream.prototype.handleStream = function () {
  var self = this

  ContextVersion.findOne({ _id: self.data.id }, function (err, version) {
    if (err) {
      dogstatsd.increment(baseDataName + '.err.no_ContextVersion_1')
      return self._writeErr('could not find build in database')
    }
    if (!self._validateVersion(version)) {
      // Grab the stream from the socket using the containerId
      var clientStream = self.socket.substream(self.data.streamId)
      // check if build already completed
      if (version.build && version.build.completed && version.build.log) {
        log.trace({
          tx: true
        }, 'build already build')
        dogstatsd.increment(baseDataName + '.build_built')

        // writeLogsToPrimusStream will take care of splitting strings and writing to primus with
        // objects, or it will simply use the objects in the db
        return version.writeLogsToPrimusStream(clientStream)
      }
      self._pipeBuildLogsToClient(version, clientStream)
    }
  })
}

BuildStream.prototype._writeErr = function (errMessage, version) {
  log.trace({
    tx: true,
    errMessage: errMessage
  }, '_writeErr')
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
  log.trace({
    tx: true
  }, '_validateVersion')
  if (!version) {
    return this._writeErr('version not found', version)
  }
  if (!version.containerId) {
    dogstatsd.increment(baseDataName + '.err.invalid_version')
    return this._writeErr('containerId not found in version', version)
  }
}

BuildStream.prototype._pipeBuildLogsToClient = function (version, clientStream) {
  var self = this
  var logData = {
    tx: true,
    version: version
  }
  log.info(logData, '_pipeBuildLogsToClient')
  var docker = new Docker()
  // make sure client stream is still writable
  if (!clientStream.stream) { return }
  docker.getLogs(version.containerId, process.env.DOCKER_BUILD_LOG_TAIL_LIMIT,
    function (err, dockerLogStream) {
      if (err) { return writeLogError(err) }
      var pipeDomain = domain.create()
      pipeDomain.on('error', function (err) {
        log.fatal(put({
          err: err
        }, logData), '_pipeBuildLogsToClient: domain err')
        error.log(err)
      })
      pipeDomain.run(function () {
        log.info(logData, '_pipeBuildLogsToClient: begin pipe job')
        var dsc = dockerStreamCleanser()
        var cleanStream = dockerLogStream.pipe(dsc)

        var jsonParser = createJSONParser(clientStream, writeLogError)
        cleanStream.pipe(jsonParser)

        dogstatsd.captureSteamData(baseDataName + '.dockerLogStream', dockerLogStream)
        dogstatsd.captureSteamData(baseDataName + '.clientStream', clientStream)
      })
    })
  function writeLogError (err) {
    log.trace({
      tx: true,
      err: err
    }, 'BuildStream.prototype._pipeBuildLogsToClient writeLogErr')
    dogstatsd.increment(baseDataName + '.err.getting_logs', ['dockerHost:' + version.dockerHost])
    error.log(err)
    return self._writeErr(err.messsage, version)
  }
}
