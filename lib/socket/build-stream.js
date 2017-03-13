/**
 * @module lib/socket/build-stream/
 */
'use strict'
const keypather = require('keypather')()
const monitorDog = require('monitor-dog')
const objectId = require('objectid')

const commonS3 = require('./common-s3')
const commonStream = require('socket/common-stream')
const ContextVersionService = require('models/services/context-version-service')
const logger = require('logger')
const PermissionService = require('models/services/permission-service')
const put = require('101/put')

const baseDataName = 'api.socket.build-stream'
const reqArgs = ['id', 'streamId']

module.exports = {
  BuildStream: BuildStream,
  buildStreamHandler: function (socket, id, data) {
    const buildStream = new BuildStream(socket, id, data)
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
  const tags = {}
  const log = logger.child(put(tags, {
    contextVersionId: this.data.id,
    method: 'BuildStream.handleStream'
  }))
  log.info('called')
  const timer = monitorDog.timer(baseDataName + '.connections.userConnect', true, tags)

  return commonStream.validateDataArgs(this.data, reqArgs)
    .bind(this)
    .then(() => {
      return ContextVersionService.findContextVersion(objectId(this.data.id))
    })
    .tap(version => {
      if (this._validateVersion(version)) {
        throw new Error('Invalid context version')
      }
      tags.container_id = keypather.get(version, 'build.dockerContainer')
      tags.dockerhost = keypather.get(version, 'dockerHost')
      return PermissionService.ensureModelAccess(this.sessionUser, version)
    })
    .then(version => {
      // Grab the stream from the socket using the containerId
      const clientStream = this.socket.substream(this.data.streamId)
      tags.result = 'success'
      timer.stop()
      // check if build already completed
      if (version.build && version.build.completed && version.build.dockerContainer) {
        log.trace('build already built, serving logs from s3')
        const jsonStream = commonStream.createJSONParser(log, clientStream)
        return commonS3.pipeLogsToClient(jsonStream, version.build.dockerContainer)
          .catch((err) => {
            log.error({error: err}, 'Error piping logs from s3 to client')
            if (err.code === 'NoSuchKey') {
              // fallback on no file exists to go against docker directly
              return commonStream.pipeLogsToClient(clientStream, baseDataName, tags, containerId, { parseJSON })
            }
            throw err
          })
      }
      const containerId = keypather.get(version, 'build.dockerContainer')
      const parseJSON = true
      monitorDog.captureStreamEvents(baseDataName + '.client', clientStream)

      return commonStream.pipeLogsToClient(clientStream, baseDataName, tags, containerId, { parseJSON })
    })
    .catch(commonStream.onValidateFailure('buildStream', this.socket, this.data.streamId, tags, timer))
}

BuildStream.prototype._writeErr = function (errMessage, version) {
  logger.trace({ errMessage }, 'BuildStream.prototype._writeErr')
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
