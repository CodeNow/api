/**
 * @module lib/socket/build-stream/
 */
'use strict'

var JSONStream = require('JSONStream')
var TCA = require('tailable-capped-array')
var dockerStreamCleanser = require('docker-stream-cleanser')
var domain = require('domain')
var isObject = require('101/is-object')
var keypather = require('keypather')()
var put = require('101/put')
var uuid = require('uuid')

var commonStream = require('socket/common-stream')
var ContextVersion = require('models/mongo/context-version')
var Docker = require('models/apis/docker')
var dogstatsd = require('models/datadog')
var error = require('error')
var log = require('middlewares/logger')(__filename).log

var baseDataName = 'api.socket.build'
var reqArgs = ['id', 'streamId']
// module.exports.buildStreamHandler = buildStream
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

  dogstatsd.increment(baseDataName + '.connections')
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
    log.warn({
      tx: true,
      err: jsonParseErr,
      streamData: data.toArray()
    }, 'createJSONParser onErrorEvent')
    onErr('json parse failed to read build logs: ' + jsonParseErr.message)
  }
  function onEndEvent () { client.end() }

  return jsonParser
}

BuildStream.prototype.handleStream = function () {
  var logData = {
    tx: true,
    sessionUser: this.sessionUser,
    id: this.data.id
  }
  log.info(logData, 'BuildStream.prototype.handleStream')
  return commonStream.validateDataArgs(this.data, reqArgs)
    .bind(this)
    .then(function () {
      return ContextVersion.findOneAsync({ _id: this.data.id })
    })
    .then(function (version) {
      if (!version) {
        throw new Error('Missing context version')
      } else if (this._validateVersion(version)) {
        throw new Error('Invalid context version')
      }
      return version
    })
    .then(function (version) {
      return commonStream.checkOwnership(this.sessionUser, version).return(version)
    })
    .then(function (version) {
      // Grab the stream from the socket using the containerId
      var clientStream = this.socket.substream(this.data.streamId)
      // check if build already completed
      if (version.build && version.build.completed && version.build.log) {
        log.trace(logData, 'build already built')
        // writeLogsToPrimusStream will take care of splitting strings and writing to primus
        // with objects, or it will simply use the objects in the db
        return version.writeLogsToPrimusStream(clientStream)
      }
      this._pipeBuildLogsToClient(version, clientStream)
    })
    .catch(commonStream.onValidateFailure('buildStream', this.socket, this.data.streamId, logData))
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
  return !keypather.get(version, 'build.dockerContainer')
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
  docker.getLogs(version.build.dockerContainer, process.env.DOCKER_BUILD_LOG_TAIL_LIMIT,
    function (err, dockerLogStream) {
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

        dogstatsd.captureSteamData(baseDataName + '.build-stream.docker', dockerLogStream)
        dogstatsd.captureSteamData(baseDataName + '.build-stream.client', clientStream)
      })
    })
  function writeLogError (err) {
    log.trace({
      tx: true,
      err: err
    }, 'BuildStream.prototype._pipeBuildLogsToClient writeLogErr')
    dogstatsd.increment(baseDataName + '.err.getting_build_logs', ['dockerHost:' + version.dockerHost])
    error.log(err)
    return self._writeErr(err.messsage, version)
  }
}
