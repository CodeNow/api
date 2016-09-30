/**
 * @module lib/socket/build-stream/
 */
'use strict'
var domain = require('domain')
var JSONStream = require('JSONStream')
var keypather = require('keypather')()
var monitorDog = require('monitor-dog')
var objectId = require('objectid')
var uuid = require('uuid')

var commonStream = require('socket/common-stream')
var ContextVersion = require('models/mongo/context-version')
var logger = require('logger')

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

BuildStream.prototype.handleStream = function () {
  var logData = {
    sessionUser: this.sessionUser,
    id: this.data.id,
    method: 'ContainerImageBuilderDied'
  }
  var log = logger.child(logData)
  log.info('BuildStream.prototype.handleStream called')
  const timer = monitorDog.timer(baseDataName + '.ttfb', true)

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
    .then(function (version) {
      return commonStream.checkOwnership(this.sessionUser, version).return(version)
    })
    .then(function (version) {
      // Grab the stream from the socket using the containerId
      var clientStream = this.socket.substream(this.data.streamId)
      const containerId = keypather.get(version, 'build.dockerContainer')
      monitorDog.captureStreamEvents(baseDataName + '.client', clientStream)
      // check if build already completed
      if (version.build && version.build.completed && version.build.log) {
        log.trace('build already built')
        // writeLogsToPrimusStream will take care of splitting strings and writing to primus
        // with objects, or it will simply use the objects in the db
        return version.writeLogsToPrimusStream(clientStream)
      }
      return commonStream.pipeLogsToClient(clientStream, containerId, { parseJSON: true, baseDataName },
        errMessage => {
          this._writeErr(errMessage, version)
        }
      )
        .tap(function (dockerLogStream) {
          dockerLogStream.once('root', () => timer.end)
        })
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
