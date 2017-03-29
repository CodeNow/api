/**
 * @module lib/socket/build-stream/
 */
const keypather = require('keypather')()
const monitorDog = require('monitor-dog')

const Boom = require('dat-middleware').Boom
const commonS3 = require('./common-s3')
const commonStream = require('socket/common-stream')
const InstanceService = require('models/services/instance-service')
const logger = require('logger')
const put = require('101/put')

const baseDataName = 'api.socket.build-stream'
const reqArgs = ['containerId', 'streamId']

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
  const tags = {
    container_id: this.data.containerId,
    isCurrentContainer: true,
    result: 'success'
  }
  const log = logger.child(put(tags, {
    containerId: this.data.containerId,
    method: 'BuildStream.handleStream'
  }))
  log.info('called')
  const timer = monitorDog.timer(baseDataName + '.connections.userConnect', true, tags)

  return commonStream.validateDataArgs(this.data, reqArgs)
    .bind(this)
    .then(() => {
      return InstanceService.fetchInstanceByContainerIdAndEnsureAccess(this.data.containerId, this.sessionUser)
    })
    .tap(res => {
      const instance = res.instance
      tags.isCurrentContainer = res.isCurrentContainer

      // Grab the stream from the socket using the containerId
      const clientStream = this.socket.substream(this.data.streamId)
      const containerId = this.data.containerId
      const parseJSON = true
      timer.stop()

      // check if build already completed
      if (tags.isCurrentContainer && keypather.get(instance, 'container.inspect.State.Running')) {
        monitorDog.captureStreamEvents(baseDataName + '.client', clientStream)
        return commonStream.pipeLogsToClient(clientStream, baseDataName, tags, containerId, { parseJSON })
      }

      log.trace('build already built, serving logs from s3')
      const jsonStream = commonStream.createJSONParser(log, clientStream)
      return commonS3.pipeLogsToClient(jsonStream, containerId)
        .catch((error) => {
          log.error({error}, 'Error piping logs from s3 to client')
          if (error.code === 'NoSuchKey') {
            // fallback on no file exists to go against docker directly
            return commonStream.pipeLogsToClient(clientStream, baseDataName, tags, containerId, { parseJSON })
          }
          throw error
        })
    })
    .catch(Instance.NotFoundError, () => {
      const notFoundError = Boom.create(404, 'Missing instance', { tags })
      notFoundError.report = false
      throw notFoundError
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
