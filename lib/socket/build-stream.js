/**
 * @module lib/socket/build-stream/
 */
'use strict'

var JSONStream = require('JSONStream')
var domain = require('domain')
var keypather = require('keypather')()
var put = require('101/put')
var uuid = require('uuid')
var isFunction = require('101/is-function')
var through2 = require('through2')

var commonStream = require('socket/common-stream')
var ContextVersion = require('models/mongo/context-version')
var Docker = require('models/apis/docker')
var dogstatsd = require('models/datadog')
var error = require('error')
var log = require('middlewares/logger')(__filename).log

var baseDataName = 'api.socket.build-stream'
var reqArgs = ['id', 'streamId']
// module.exports.buildStreamHandler = buildStream
module.exports = {
  BuildStream: BuildStream,
  buildStreamHandler: function (socket, id, data) {
    var buildStream = new BuildStream(socket, id, data)
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

  dogstatsd.increment(baseDataName + '.connections')
}

BuildStream.prototype.handleStream = function () {
  var logData = {
    tx: true,
    sessionUser: this.sessionUser,
    id: this.data.id
  }
  log.info(logData, 'BuildStream.prototype.handleStream')
  return commonStream.validateDataArgs(this.data, reqArgs)
    .bind(this)
    .then(function () {
      return ContextVersion.findOneAsync({ _id: this.data.id })
    })
    .then(function (version) {
      if (!version) {
        throw new Error('Missing context version')
      } else if (this._validateVersion(version)) {
        throw new Error('Invalid context version')
      }
      return version
    })
    .then(function (version) {
      return commonStream.checkOwnership(this.sessionUser, version).return(version)
    })
    .then(function (version) {
      // Grab the stream from the socket using the containerId
      var clientStream = this.socket.substream(this.data.streamId)
      dogstatsd.captureSteamData(baseDataName + '.client', clientStream)
      // check if build already completed
      if (version.build && version.build.completed && version.build.log) {
        log.trace(logData, 'build already built')
        // writeLogsToPrimusStream will take care of splitting strings and writing to primus
        // with objects, or it will simply use the objects in the db
        return version.writeLogsToPrimusStream(clientStream)
      }
      this._pipeBuildLogsToClient(version, clientStream)
    })
    .catch(commonStream.onValidateFailure('buildStream', this.socket, this.data.streamId, logData))
}

BuildStream.prototype._writeErr = function (errMessage, version) {
  log.trace({
    tx: true,
    errMessage: errMessage
  }, 'BuildStream.prototype._writeErr')
  if (this.socket.writable) {
    this.socket.write({
      id: this.id,
      error: errMessage,
      data: version
    })
  }
  return true
}

BuildStream.prototype._validateVersion = function (version) {
  log.trace({
    tx: true
  }, 'BuildStream.prototype._validateVersion')
  return !keypather.get(version, 'build.dockerContainer')
}

BuildStream.prototype._pipeBuildLogsToClient = function (version, clientStream) {
  var self = this
  var logData = {
    tx: true,
    version: version._id,
    dockerContainer: keypather.get(version, 'build.dockerContainer')
  }
  log.info(logData, 'BuildStream.prototype._pipeBuildLogsToClient')
  var docker = new Docker()
  // make sure client stream is still writable
  if (!clientStream.stream) { return }
  docker.getLogs(version.build.dockerContainer, function (err, dockerLogStream) {
    if (err) { return writeLogError(err) }
    var pipeDomain = domain.create()

    /**
     * For trace logging w/ bunyan
     */
    var runnableData = keypather.get(process, 'domain.runnableData')
    if (runnableData) {
      pipeDomain.runnableData = runnableData
    } else {
      pipeDomain.runnableData = {
        tid: uuid.v4(),
        reqStart: new Date()
      }
    }

    pipeDomain.on('error', function (err) {
      log.fatal(put({
        err: err
      }, logData), '_pipeBuildLogsToClient: domain err')
      error.log(err)
    })
    pipeDomain.run(function () {
      log.info(logData, '_pipeBuildLogsToClient: begin pipe job')
      var jsonParser = JSONStream.parse()

      var stream = through2();


      var demuxer = function(stream, stdout, stderr) {
        var header = null;

        stream.on('readable', function() {
          header = header || stream.read(8);

          while (header !== null) {
            console.log('Header', header.toString());
            var type = header.readUInt8(0);
            var payload = stream.read(header.readUInt32BE(4));
            if (payload === null) break;
            if (type == 2) {
              stderr.write(payload);
            } else {
              console.log('Not type 2', type.toString(), payload.toString());
              stdout.write(payload);
            }
            header = stream.read(8);
          }
        });
      };

      demuxer(dockerLogStream, stream, clientStream)

      stream.on('data', function (data) {
        console.log('Data', data.toString());
        jsonParser.write(data);
      });

      stream.on('error', function (err) {
        console.log('Error', err);
      });


      jsonParser.on('root', function (data) {
        if (clientStream.stream) {
          clientStream.write(data);
        }
      })

      jsonParser.on('data', function (data) {
        console.log('JSONParser Data', data);
      })
      jsonParser.on('error', function (err) {
        console.log('JSONParser Error', err);
      })


      clientStream.on('end', function () {
        if (isFunction(jsonParser.end)) {
          jsonParser.end()
        }
      })
      jsonParser.on('finish', function () {
        if (isFunction(clientStream.end)) {
          clientStream.off('data')
          clientStream.end()
        }
      })
      dogstatsd.captureSteamData(baseDataName + '.docker-logs', dockerLogStream)
    })
  })
  function writeLogError (err) {
    log.trace({
      tx: true,
      err: err
    }, 'BuildStream.prototype._pipeBuildLogsToClient writeLogErr')
    dogstatsd.increment(baseDataName + '.err.getting_build_logs', ['dockerHost:' + version.dockerHost])
    error.log(err)
    return self._writeErr(err.messsage, version)
  }
}
