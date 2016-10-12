'use strict'
var dockerModem = require('docker-modem')
var keypather = require('keypather')()
var JSONStream = require('JSONStream')
var Promise = require('bluebird')
var put = require('101/put')
var domain = require('domain')

var logger = require('logger')
var Docker = require('models/apis/docker')
var monitorDog = require('monitor-dog')
var through2 = require('through2')

function onValidateFailure (moduleName, socket, handlerId, tags, timer) {
  return function (err) {
    logger.warn(put({
      err: err
    }, tags), moduleName + ' failed')
    keypather.set(err, 'data.level', 'warning')
    socket.write({
      id: handlerId,
      error: 'You don\'t have access to this stream',
      message: err.message
    })
    tags.result = 'failure'
    timer.stop()
    throw err
  }
}
function validateDataArgs (data, argsArray) {
  if (!argsArray.every(data.hasOwnProperty.bind(data))) {
    throw new Error(argsArray.join(' and ') + ' are required')
  }
}

function pipeAndEndOnError (log, fromStream, toStream) {
  function onEndEvent () {
    toStream.end()
  }
  function onErrorEvent (err) {
    fromStream.removeListener('error', onErrorEvent)
    fromStream.removeListener('end', onEndEvent)
    log.error({ err }, 'stream errored, ending: ' + err.message)
    toStream.end()
  }
  fromStream.on('error', onErrorEvent)
  fromStream.on('end', onEndEvent)
  fromStream.pipe(toStream)
}

function buff2StringTransform (chunk, enc, cb) {
  if (chunk) {
    this.push(chunk.toString())
  }
  cb()
}

/**
 * Fetch the logs for a container, and stream them through a clientstream to the user
 *
 * @param {Socket.substream} clientStream      - substream to pipe the logs to
 * @param {String}           baseDataName      - label to put on the dataDog queries
 * @param {Object}           tags              - tags to be included in the datadog event
 * @param {String}           containerId       - docker container id
 * @param {Object}           opts              - options for this stream
 * @param {Object}           opts.tailLimit    - number of lines to tail the log by
 *
 * @resolves {Socket} Stream that
 */
function pipeLogsToClient (clientStream, baseDataName, tags, containerId, opts) {
  var log = logger.child({
    method: 'pipeLogsToClient',
    dockerContainer: containerId
  })
  const tailLimit = opts.tailLimit
  const docker = new Docker({ timeout: 0 })
  const timer = monitorDog.timer(baseDataName + '.connections.timeTillFirstByte', true, tags)

  log.info('pipeLogsToClient called')
  // make sure client stream is still writable
  if (!clientStream.stream) { return }
  return docker.getLogsAsync(containerId, tailLimit)
    .catch(err => {
      monitorDog.increment(baseDataName + '.connections', put(tags, { result: 'failure' }))
      throw err
    })
    .then(function (dockerLogStream) {
      dockerLogStream.once('data', () => {
        tags.result = 'success'
        timer.stop()
      })
      dockerLogStream.once('error', () => {
        tags.result = 'failure'
        timer.stop()
      })
      monitorDog.increment(baseDataName + '.connections', put(tags, { result: 'success' }))
      var buff2String = through2({ objectMode: true }, buff2StringTransform)
      pipeAndEndOnError(log, buff2String, clientStream)
      dockerModem.prototype.demuxStream(dockerLogStream, buff2String, buff2String)
    })
}

module.exports = {
  onValidateFailure: onValidateFailure,
  pipeLogsToClient: pipeLogsToClient,
  validateDataArgs: Promise.method(validateDataArgs)
}
