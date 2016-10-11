/**
 * @module lib/socket/log-stream
 */
'use strict'
var error = require('dat-middleware').Boom
var isFunction = require('101/is-function')
var keypather = require('keypather')()
var monitorDog = require('monitor-dog')

var commonStream = require('./common-stream')
var Instance = require('models/mongo/instance')
var logger = require('logger')
var PermissionService = require('models/services/permission-service')
var put = require('101/put')

module.exports.logStreamHandler = logHandler

var reqArgs = ['dockHost', 'containerId']
var baseDataName = 'api.socket.log'
function logHandler (socket, id, data) {
  monitorDog.increment(baseDataName + '.connections')
  var sessionUser = keypather.get(socket, 'request.sessionUser')
  const tags = {
    container_id: data.containerId,
    dockerhost: data.dockHost
  }
  var log = logger.child(put(tags, { method: 'LogStream.logHandler' }))
  log.info('LogStream.logHandler')
  const timer = monitorDog.timer(baseDataName + '.connections.userConnect', true, tags)
  // check required args
  return commonStream.validateDataArgs(data, reqArgs)
    .then(() => {
      // Fetch an instance with this containerId
      return Instance.findOneByContainerIdAsync(data.containerId)
    })
    .tap(instance => {
      if (!instance) {
        var notFound = error.create(404, 'Missing instance', data)
        notFound.report = false
        log.error({ err: notFound }, 'logHandler error: instance not found')
        throw notFound
      }
    })
    .tap(instance => {
      return PermissionService.ensureModelAccess(sessionUser, instance)
    })
    .then(instance => {
      tags.result = 'success'
      timer.stop()
      return setupLogs(socket, id, data, instance, tags)
    })
    .catch(commonStream.onValidateFailure('logHandler', socket, id, tags, timer))
}

function setupLogs (socket, id, data, instance, tags) {
  var sessionUser = keypather.get(socket, 'request.sessionUser')
  var log = logger.child(put(tags, {
    instance,
    userId: keypather.get(sessionUser, 'accounts.github.id')
  }))
  log.info('LogStream setupLogs')
  // Grab the stream from the socket using the containerId
  var destLogStream = socket.substream(data.containerId)
  // Now call the Docker.getLogs function to
  var tailLimit = process.env.DOCKER_LOG_TAIL_LIMIT
  if (instance.isTesting) {
    tailLimit = process.env.DOCKER_TEST_LOG_TAIL_LIMIT
  }

  // return to client id to listen too
  socket.write({
    id: id,
    event: 'LOG_STREAM_CREATED',
    data: {
      substreamId: data.containerId
    }
  })
  return commonStream.pipeLogsToClient(destLogStream, baseDataName, tags, data.containerId, { tailLimit })
    .catch(function (err) {
      tags.result = 'failure'
      monitorDog.increment(baseDataName + '.err.getting_logs', tags)
      log.error({ err: err }, 'Container getLogs error')
      // we got an error, close destination stream
      socket.write({ id: id, error: err, data: data })
      if (isFunction(destLogStream.end)) {
        destLogStream.end()
      }
    })
}
