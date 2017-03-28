/**
 * @module lib/socket/log-stream
 */
'use strict'
const isFunction = require('101/is-function')
const keypather = require('keypather')()
const monitorDog = require('monitor-dog')

const commonStream = require('./common-stream')
const commonS3 = require('./common-s3')
const InstanceService = require('models/services/instance-service')
const logger = require('logger')
const put = require('101/put')
const rabbitMQ = require('models/rabbitmq')

module.exports.logStreamHandler = logHandler

const reqArgs = ['containerId']
const baseDataName = 'api.socket.log'
function logHandler (socket, id, data) {
  monitorDog.increment(baseDataName + '.connections')
  const sessionUser = keypather.get(socket, 'request.sessionUser')
  const tags = {
    container_id: data.containerId,
    isCurrentContainer: true
  }
  const log = logger.child(put(tags, { method: 'LogStream.logHandler' }))
  log.info('LogStream.logHandler')
  const timer = monitorDog.timer(baseDataName + '.connections.userConnect', true, tags)
  // check required args
  return commonStream.validateDataArgs(data, reqArgs)
    .then(() => {
      return InstanceService.fetchInstanceByContainerIdAndEnsureAccess(data.containerId, sessionUser)
    })
    .then(res => {
      tags.result = 'success'
      tags.isCurrentContainer = res.isCurrentContainer
      timer.stop()
      return setupLogs(socket, id, data, res.instance, tags)
    })
    .catch(commonStream.onValidateFailure('logHandler', socket, id, tags, timer))
}

function setupLogs (socket, id, data, instance, tags) {
  const sessionUser = keypather.get(socket, 'request.sessionUser')
  const log = logger.child(put(tags, {
    instance,
    userId: keypather.get(sessionUser, 'accounts.github.id')
  }))
  log.info('LogStream setupLogs')
  // Grab the stream from the socket using the containerId
  const destLogStream = socket.substream(data.containerId)
  // Now call the Docker.getLogs function to
  var tailLimit = process.env.DOCKER_LOG_TAIL_LIMIT
  if (instance.isTesting) {
    tailLimit = process.env.DOCKER_TEST_LOG_TAIL_LIMIT
  }

  // return to client id to listen too
  socket.write({
    id,
    event: 'LOG_STREAM_CREATED',
    data: {
      substreamId: data.containerId
    }
  })
  const eventData = {
    container: {
      id: data.containerId
    },
    instance,
    user: {
      githubId: keypather.get(sessionUser, 'accounts.github.id'),
      id: keypather.get(sessionUser, 'bigPoppaUser.id')
    },
    organization: {
      githubId: keypather.get(instance, 'owner.github'),
      githubOrgUsername: keypather.get(instance, 'owner.username')
    }
  }
  rabbitMQ.publishLogStreamConnected(eventData)
  let streamPromise
  if (tags.isCurrentContainer && keypather.get(instance, 'container.inspect.State.Running')) {
    streamPromise = commonStream.pipeLogsToClient(destLogStream, baseDataName, tags, data.containerId, { tailLimit })
  } else {
    streamPromise = commonS3.pipeLogsToClient(destLogStream, data.containerId)
      .catch((err) => {
        log.error({error: err}, 'Error piping logs from s3 to client')
        if (err.code === 'NoSuchKey') {
          // fallback on no file exists to go against docker directly
          return commonStream.pipeLogsToClient(destLogStream, baseDataName, tags, data.containerId, { tailLimit })
        }
        throw err
      })
  }

  return streamPromise
    .catch(function (err) {
      tags.result = 'failure'
      monitorDog.increment(baseDataName + '.err.getting_logs', tags)
      log.error({ err }, 'Container getLogs error')
      // we got an error, close destination stream
      socket.write({ id, error: err, data })
      if (isFunction(destLogStream.end)) {
        destLogStream.end()
      }
    })
}
