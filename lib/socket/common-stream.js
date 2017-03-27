'use strict'
const clioClient = require('@runnable/clio-client')
var isObject = require('101/is-object')
var put = require('101/put')
var Promise = require('bluebird')
var dockerModem = require('docker-modem')
var domain = require('domain')
var keypather = require('keypather')()
var JSONStream = require('JSONStream')
var monitorDog = require('monitor-dog')
var through2 = require('through2')

var logger = require('logger')
var Docker = require('models/apis/docker')
const error = require('dat-middleware').Boom
const Instance = require('models/mongo/instance')
const PermissionService = require('models/services/permission-service')

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
 * Connects a docker container stream to a user through the toStream.  This connection will
 * parse out the Docker header, toString the values, and parse the JSON (if necessary)
 *
 * @param {Socket}           fromStream - Container stream from Docker
 * @param {Socket.Substream} toStream    - Substream that goes to the user
 * @param {Log}              log             - Log child from the main function with all the good
 *                                               stuff still attached
 * @returns {Stream} Returns the Buff2String stream that is between the two sockets
 */
function connectStream (fromStream, toStream, log) {
  var buff2String = through2({ objectMode: true }, buff2StringTransform)
  pipeAndEndOnError(log, buff2String, toStream)
  dockerModem.prototype.demuxStream(fromStream, buff2String, buff2String)
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
        let toStream = (parseJSON) ? createJSONParser(log, clientStream) : clientStream
        connectStream(dockerLogStream, toStream, log)
      })
    })
}

function fetchInstanceByContainerIdAndEnsureAccess (containerId, sessionUser) {
  const log = logger.child({
    method: 'ensureModelAccessByContainerId',
    containerId
  })
  return Instance.findOneByContainerIdAsync(containerId)
    .then((instance) => {
      if (instance) {
        return { instance, isCurrentContainer: true }
      }
      log.trace('No instance found, fetching from history')
      // Instance not found, but perhaps we are looking for old logs!
      return clioClient.fetchContainerInstance(containerId)
        .then((instanceId) => {
          if (instanceId) {
            log.trace({ instanceId }, 'Found instanceId in history, fetching from database')
            return { instance: Instance.findByIdAsync(instanceId), isCurrentContainer: false }
          }
        })
    })
    .tap(res => {
      if (!res.instance) {
        const notFound = error.create(404, 'Missing instance', { containerId })
        notFound.report = false
        log.error({ err: notFound }, 'logHandler error: instance not found')
        throw notFound
      }
    })
    .tap(res => {
      return PermissionService.ensureModelAccess(sessionUser, res.instance)
    })
}

module.exports = {
  buff2StringTransform: buff2StringTransform,
  connectStream: connectStream,
  createJSONParser: createJSONParser,
  onValidateFailure: onValidateFailure,
  pipeAndEndOnError: pipeAndEndOnError,
  pipeLogsToClient: pipeLogsToClient,
  validateDataArgs: Promise.method(validateDataArgs),
  fetchInstanceByContainerIdAndEnsureAccess
}
