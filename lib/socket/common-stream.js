'use strict'
var dockerModem = require('docker-modem')
var keypather = require('keypather')()
var isObject = require('101/is-object')
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

function createJSONParser (log, client) {
  var jsonParser = JSONStream.parse()
  jsonParser.on('root', onRootEvent)
  jsonParser.on('error', onErrorEvent)
  jsonParser.on('end', onEndEvent)

  function onRootEvent (data) {
    if (!isObject(data)) { data = {} }
    client.write(data)
  }
  function onErrorEvent (jsonParseErr) {
    jsonParser.removeListener('root', onRootEvent)
    jsonParser.removeListener('error', onErrorEvent)
    jsonParser.removeListener('end', onEndEvent)
    log.error({ err: jsonParseErr }, 'json parse failed to read build logs: ' + jsonParseErr.message)
    client.end()
  }
  function onEndEvent () {
    client.end()
  }
  return jsonParser
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
 * Connects a docker container stream to a user through the clientStream.  This connection will
 * parse out the Docker header, toString the values, and parse the JSON (if necessary)
 *
 * @param {Socket}           containerStream - Container stream from Docker
 * @param {Socket.Substream} clientStream    - Substream that goes to the user
 * @param {Log}              log             - Log child from the main function with all the good
 *                                               stuff still attached
 * @param {Boolean}          parseJSON       - True if the source stream is JSON that should be
 *                                               parsed
 * @returns {Stream} Returns the Buff2String stream that is between the two sockets
 */
function connectStream (containerStream, clientStream, log, parseJSON) {
  var buff2String = through2({ objectMode: true }, buff2StringTransform)
  if (parseJSON) {
    var jsonParser = createJSONParser(log, clientStream)
    pipeAndEndOnError(log, buff2String, jsonParser)
  } else {
    pipeAndEndOnError(log, buff2String, clientStream)
  }
  dockerModem.prototype.demuxStream(containerStream, buff2String, buff2String)
  return buff2String
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
 * @param {Boolean}          opts.parseJSON    - true if the log data is json, and should be parsed
 *
 * @resolves {Socket} Stream that
 */
function pipeLogsToClient (clientStream, baseDataName, tags, containerId, opts) {
  var log = logger.child({
    method: 'pipeLogsToClient',
    dockerContainer: containerId
  })
  const tailLimit = opts.tailLimit
  const parseJSON = opts.parseJSON
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

      var pipeDomain = domain.create()
      pipeDomain.on('error', function (err) {
        log.fatal({ err: err }, 'domain err')
        tags.result = 'failure'
        timer.stop()
      })
      pipeDomain.run(function () {
        connectStream(dockerLogStream, clientStream, log, parseJSON)
      })
    })
}

module.exports = {
  onValidateFailure: onValidateFailure,
  pipeLogsToClient: pipeLogsToClient,
  pipeAndEndOnError: pipeAndEndOnError,
  connectStream: connectStream,
  validateDataArgs: Promise.method(validateDataArgs)
}
