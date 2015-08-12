/**
 * @module lib/socket/build-stream/
 */
'use strict';

var createFrame = require('docker-frame');
var pump = require('substream-pump');
// var through = require('through');
var dsc = require('docker-stream-cleanser')();

var ContextVersion = require('models/mongo/context-version');
var Docker = require('models/apis/docker');
var dogstatsd = require('models/datadog');
var error = require('error');
var logger = require('middlewares/logger')(__filename);

var baseDataName = 'api.socket.build';
var log = logger.log;

// module.exports.buildStreamHandler = buildStream;
module.exports = {
  BuildStream: BuildStream,
  buildStreamHandler: function (socket, id, data) {
    var buildStream = new BuildStream(socket, id, data);
    buildStream.handleStream();
  }
};

/**
 * Handle client-initiated request for a build-stream
 * @param {Object} socket
 * @param {String} id
 * @param {Object} data
 * @returns {null}
 */
function BuildStream (socket, id, data) {
  this.socket = socket;
  this.id = id;
  this.data = data;
  dogstatsd.increment(baseDataName + '.connections');
  // check required args
  if (!data.id || !data.streamId) {
    dogstatsd.increment(baseDataName + '.err.invalid_args');
    return this._writeErr('data.id and data.streamId are required');
  }
}

BuildStream.prototype.handleStream = function () {
  var self = this;
  ContextVersion.findOne({ _id: self.data.id }, function (err, version) {
    if (err) {
      dogstatsd.increment(baseDataName + '.err.no_ContextVersion_1');
      return self._writeErr('could not find build in database');
    }
    if (!self._validateVersion(version)) {
      // Grab the stream from the socket using the containerId
      var clientStream = self.socket.substream(self.data.streamId);
      // check if build already completed
      if (version.build && version.build.completed && version.build.log) {
        log.trace({
          tx: true
        }, 'build already build');
        dogstatsd.increment(baseDataName + '.build_built');
        clientStream.write(createFrame(1, version.build.log)); // 1 indicates stdout
        return clientStream.end();
      }
      self._pipeBuildLogsToClient(version, clientStream);
    }
  });
};

BuildStream.prototype._writeErr = function (errMessage, version) {
  log.trace({
    tx: true,
    errMessage: errMessage
  }, '_writeErr');
  if (this.socket.writable) {
    this.socket.write({
      id: this.id,
      error: errMessage,
      data: version
    });
  }
  return true;
};

BuildStream.prototype._validateVersion = function (version) {
  log.trace({
    tx: true
  }, '_validateVersion');
  if (!version) {
    return this._writeErr('version not found', version);
  }
  if (!version.dockerHost || !version.containerId) {
    dogstatsd.increment(baseDataName + '.err.invalid_version');
    return this._writeErr('dockerHost or containerId not found in version', version);
  }
};

BuildStream.prototype._pipeBuildLogsToClient = function (version, clientStream) {
  var self = this;
  log.trace({
    tx: true,
    version: version
  }, '_pipeBuildLogsToClient');
  var docker = new Docker(version.dockerHost);
  // make sure client stream is still writable
  if (!clientStream.stream) { return; }
  docker.getLogs(version.containerId, process.env.DOCKER_BUILD_LOG_TAIL_LIMIT,
    function (err, dockerLogStream) {
      if (err) { return writeLogError(err); }
      var cleanStream = dockerLogStream.pipe(dsc);
      cleanStream.pipe(clientStream);
      // pump(cleanStream, clientStream, function (pumpErr) {
      //   if (pumpErr) { return writeLogError(pumpErr); }
      // });
      dogstatsd.captureSteamData(baseDataName + '.dockerLogStream', dockerLogStream);
      dogstatsd.captureSteamData(baseDataName + '.clientStream', clientStream);
    });
  function writeLogError (err) {
    log.trace({
      tx: true,
      err: err
    }, 'writeLogErr');
    dogstatsd.increment(baseDataName + '.err.getting_logs', ['dockerHost:' + version.dockerHost]);
    error.log(err);
    return self._writeErr(err.messsage, version);
  }
};

