/**
 * TODO document
 * @module lib/socket/log-stream
 */
'use strict'

var commonStream = require('./common-stream')
var Docker = require('models/apis/docker')
var monitorDog = require('monitor-dog')
var logger = require('middlewares/logger')(__filename)
var Instance = require('models/mongo/instance')
var isFunction = require('101/is-function')
var keypather = require('keypather')()

var log = logger.log

module.exports.logStreamHandler = logHandler

var reqArgs = ['dockHost', 'containerId']
var baseDataName = 'api.socket.log'
function logHandler (socket, id, data) {
  monitorDog.increment(baseDataName + '.connections')

  var sessionUser = keypather.get(socket, 'request.sessionUser')
  var logData = {
    tx: true,
    containerId: data.containerId,
    dockHost: data.dockHost,
    sessionUser: sessionUser
  }
  log.info(logData, 'LogStream.logHandler')
  // check required args
  return commonStream.validateDataArgs(data, reqArgs)
    .then(function () {
      // Fetch an instance with this containerId
      return Instance.findOneAsync({ 'container.dockerContainer': data.containerId })
    })
    .then(function (instance) {
      if (!instance) {
        throw new Error('Missing instance')
      }
      return instance
    })
    .then(function (instance) {
      return commonStream.checkOwnership(sessionUser, instance)
    })
    .then(function () {
      setupLogs(socket, id, data)
    })
    .catch(commonStream.onValidateFailure('logHandler', socket, id, logData))
}

function setupLogs (socket, id, data) {
  // Grab the stream from the socket using the containerId
  var destLogStream = socket.substream(data.containerId)
  // Now call the Docker.getLogs function to
  var docker = new Docker({ timeout: 0 })
  docker.getLogs(data.containerId, process.env.DOCKER_LOG_TAIL_LIMIT,
    function (err, dockerLogStream) {
      if (err) {
        monitorDog.increment(baseDataName + '.err.getting_logs', ['dockerHost:' + data.dockerHost])
        log.error({ tx: true, err: err }, 'Container getLogs error')
        // we got an error, close destination stream
        socket.write({ id: id, error: err, data: data })
        if (isFunction(destLogStream.end)) {
          destLogStream.end()
        }
        return
      } else {
        joinStreams(dockerLogStream, destLogStream)
        joinEnds(dockerLogStream, destLogStream)
        monitorDog.captureStreamEvents(baseDataName + '.dockerLogStream', dockerLogStream)
        monitorDog.captureStreamEvents(baseDataName + '.destLogStream', destLogStream)
      }
    })

  // return to client id to listen too
  socket.write({
    id: id,
    event: 'LOG_STREAM_CREATED',
    data: {
      substreamId: data.containerId
    }
  })
}

/**
 * Simply links the sources onData handler to the destination's write, thus piping the data from
 * source to destination
 * @param src Source (Readable) Stream
 * @param des Destination (Writeable) Stream
 */
function joinStreams (src, des) {
  src.setEncoding('hex')
  src.on('data', function (data) {
    if (des.stream) {
      des.write(data)
    }
  })
}

/**
 * Connects the onEnd events of both the source and destination streams together so that when one
 * ends, the other one does as well
 * @param src Source (Readable) Stream
 * @param des Destination (Writeable) Stream
 */
function joinEnds (src, des) {
  src.on('end', function () {
    if (isFunction(des.end)) {
      des.end()
    }
  })

  des.on('finish', function () {
    if (isFunction(src.end)) {
      src.off('data')
      src.end()
    }
  })
}
