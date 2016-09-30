'use strict'
var dockerModem = require('docker-modem')
var keypather = require('keypather')()
var isObject = require('101/is-object')
var JSONStream = require('JSONStream')
var Promise = require('bluebird')
var put = require('101/put')

var logger = require('logger')
var Docker = require('models/apis/docker')
var me = require('middlewares/me')
var monitorDog = require('monitor-dog')
var through2 = require('through2')

function checkOwnership (sessionUser, model) {
  if (model.toJSON) {
    model = model.toJSON()
  }
  var req = {
    sessionUser: sessionUser,
    model: model
  }
  var log = logger.child({
    modelId: model._id,
    sessionUser: sessionUser,
    method: 'checkOwnership'
  })
  log.info('common-stream.checkOwnership')
  return Promise.any([
    Promise.fromCallback(function (callback) {
      me.isOwnerOf('model')(req, {}, callback)
    }),
    Promise.fromCallback(function (callback) {
      me.isModerator(req, {}, callback)
    })
  ])
  .catch(function (err) {
    log.warn({ err: err }, 'failed')
    throw err
  })
}
function onValidateFailure (moduleName, socket, handlerId, logData) {
  return function (err) {
    logger.warn(put({
      err: err
    }, logData), moduleName + ' failed')
    keypather.set(err, 'data.level', 'warning')
    socket.write({
      id: handlerId,
      error: 'You don\'t have access to this stream',
      message: err.message
    })
    throw err
  }
}
function validateDataArgs (data, argsArray) {
  if (!argsArray.every(data.hasOwnProperty.bind(data))) {
    throw new Error(argsArray.join(' and ') + ' are required')
  }
}

function createJSONParser (client, onErr) {
  onErr = onErr || function () {}
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
    onErr(jsonParseErr, 'json parse failed to read build logs: ' + jsonParseErr.message)
  }
  function onEndEvent () {
    client.end()
  }

  return jsonParser
}

function pipeLogsToClient (clientStream, containerId, opts, onErr) {
  var log = logger.child({
    method: 'pipeLogsToClient',
    dockerContainer: containerId
  })
  const baseDataName = opts.baseDataName
  const tailLimit = opts.tailLimit
  const parseJSON = opts.parseJSON
  const docker = new Docker({ timeout: 0 })

  log.info('pipeLogsToClient called')
  // make sure client stream is still writable
  if (!clientStream.stream) { return }
  var buff2String = through2({ objectMode: true }, function transform (chunk, enc, cb) {
    if (chunk) {
      this.push(chunk.toString())
    }
    cb()
  })
  if (parseJSON) {
    var jsonParser = createJSONParser(clientStream, onErr)
    buff2String.pipe(jsonParser)
  } else {
    buff2String.pipe(clientStream)
  }
  return docker.getLogsAsync(containerId, tailLimit)
    .catch(err => {
      monitorDog.increment(baseDataName + '.connections.failure')
      throw err
    })
    .then(function (dockerLogStream) {
      monitorDog.increment(baseDataName + '.connections.success')
      dockerModem.prototype.demuxStream(dockerLogStream, buff2String, buff2String)

      dockerLogStream.on('end', function () {
        buff2String.end()
      })
      return buff2String
    })
}

module.exports = {
  checkOwnership: checkOwnership,
  onValidateFailure: onValidateFailure,
  pipeLogsToClient: pipeLogsToClient,
  validateDataArgs: Promise.method(validateDataArgs)
}
