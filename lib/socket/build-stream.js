/**
 * @module lib/socket/build-stream/
 */
'use strict'
var keypather = require('keypather')()
var monitorDog = require('monitor-dog')
var objectId = require('objectid')

var commonStream = require('socket/common-stream')
var ContextVersionService = require('models/services/context-version-service')
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

BuildStream.prototype.handleStream = function () {
  var logData = {
    sessionUser: this.sessionUser,
    id: this.data.id,
    method: 'ContainerImageBuilderDied'
  }
  var log = logger.child(logData)
  log.info('BuildStream.prototype.handleStream called')
  const timer = monitorDog.timer(baseDataName + '.connections.userConnect', true)

  return commonStream.validateDataArgs(this.data, reqArgs)
    .bind(this)
    .then(() => {
      return ContextVersionService.findContextVersion(objectId(this.data.id))
    })
    .tap(version => {
      if (this._validateVersion(version)) {
        throw new Error('Invalid context version')
      }
    })
    .tap(version => {
      return PermissionService.ensureModelAccess(this.sessionUser, version)
    })
    .then(version => {
      // Grab the stream from the socket using the containerId
      var clientStream = this.socket.substream(this.data.streamId)
      // check if build already completed
      if (version.build && version.build.completed && version.build.log) {
        log.trace('build already built')
        // writeLogsToPrimusStream will take care of splitting strings and writing to primus
        // with objects, or it will simply use the objects in the db
        version.writeLogsToPrimusStream(clientStream)
        return clientStream
      }
      const containerId = keypather.get(version, 'build.dockerContainer')
      const parseJSON = true
      monitorDog.captureStreamEvents(baseDataName + '.client', clientStream)
      timer.stop()
      return commonStream.pipeLogsToClient(clientStream, containerId, { parseJSON, baseDataName })
    })
    .catch(commonStream.onValidateFailure('buildStream', this.socket, this.data.streamId, logData))
    .finally(() => timer.stop)
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
