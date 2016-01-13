/**
 * TODO document
 * @module lib/socket/log-stream
 */
'use strict'

var commonStream = require('./common-stream')
var Docker = require('models/apis/docker')
var dogstatsd = require('models/datadog')
var logger = require('middlewares/logger')(__filename)
var Instance = require('models/mongo/instance')
var keypather = require('keypather')()

var log = logger.log
var put = require('101/put')
var Promise = require('bluebird')

module.exports.logStreamHandler = logHandler

var baseDataName = 'api.socket.log'
function logHandler (socket, id, data) {
  dogstatsd.increment(baseDataName + '.connections')
  // auth token used when we connect from other server
  var authToken = keypather.get(socket, 'request.query.token')
  // user id should exist when connecting from browser
  var userId = keypather.get(socket, 'request.session.passport.user')
  var sessionUser = {}
  keypather.set(sessionUser, 'accounts.github.id', userId)
  keypather.set(sessionUser, 'accounts.github.accessToken', authToken)

  var logData = {
    tx: true,
    containerId: data.containerId,
    sessionUser: sessionUser
  }
  log.info(logData, 'LogStream.logHandler')
  // check required args
  if (!data.dockHost ||
    !data.containerId) {
    dogstatsd.increment(baseDataName + '.err.invalid_args')
    return socket.write({
      id: id,
      error: 'dockHost and containerId are required',
      data: data
    })
  }
  // Fetch an instance with this containerId
  return Promise.fromCallback(function (callback) {
    Instance.findOne({ 'container.dockerContainer': data.containerId }, callback)
  })
    .then(function (instance) {
      if (!instance) {
        dogstatsd.increment(baseDataName + '.err.logstream_missing_instance')
        throw new Error('Missing instance')
      }
      return instance
    })
    .then(function (instance) {
      return commonStream.checkOwnership(sessionUser, instance)
    })
    .catch(function (err) {
      log.warn(put({
        err: err
      }, logData), 'Container getLogs missing instance')
      socket.write({
        id: socket.id,
        error: 'You don\'t have access to this stream'
      })
      dogstatsd.increment(baseDataName + '.err.nonowner_logstream')
      throw err
    })
    .then(function () {
      setupLogs(socket, id, data)
    })
}

function setupLogs (socket, id, data) {
  // Grab the stream from the socket using the containerId
  var destLogStream = socket.substream(data.containerId)
  // Now call the Docker.getLogs function to
  var docker = new Docker({ timeout: 0 })
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
    if (des.end) {
      des.end()
    }
  })

  des.on('finish', function () {
    if (src.end) {
      src.off('data')
      src.end()
    }
  })
}
