/**
 * TODO document
 * @module lib/socket/log-stream
 */
'use strict'

var keypather = require('keypather')()

var commonStream = require('./common-stream')
var Docker = require('models/apis/docker')
var dogstatsd = require('models/datadog')
var Instance = require('models/mongo/instance')
var logger = require('middlewares/logger')(__filename)

var log = logger.log

module.exports.logStreamHandler = logHandler

var reqArgs = ['dockHost', 'containerId']
var baseDataName = 'api.socket.log'
function logHandler (socket, id, data) {
  dogstatsd.increment(baseDataName + '.connections')

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
  var docker = new Docker()
  docker.getLogs(data.containerId, process.env.DOCKER_LOG_TAIL_LIMIT,
    function (err, dockerLogStream) {
      if (err) {
        dogstatsd.increment(baseDataName + '.err.getting_logs', ['dockerHost:' + data.dockerHost])
        log.error({ tx: true, err: err }, 'Container getLogs error')
        return socket.write({ id: id, error: err, data: data })
      } else {
        joinStreams(dockerLogStream, destLogStream)
        joinEnds(dockerLogStream, destLogStream)
        dogstatsd.captureSteamData(baseDataName + '.dockerLogStream', dockerLogStream)
        dogstatsd.captureSteamData(baseDataName + '.destLogStream', destLogStream)
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
    log.trace({data: data.toString()}, 'log data')
    if (des.stream) {
      des.write(data)
    } else {
      log.trace({log: log.toString()}, 'log not sent')
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
    log.trace('src end')
    if (des.end) {
      des.end()
    } else {
      log.trace('src ended but des.end end fail')
    }
  })

  des.on('finish', function () {
    log.trace('des finish')
    if (src.end) {
      src.off('data')
      src.end()
    } else {
      log.trace('des finish but des.end end fail')
    }
  })
}
