/**
 * TODO: Document
 * @module lib/socket/build-stream/
 */
'use strict';

var createFrame = require('docker-frame');
var debug = require('debug')('runnable-api:socket:build-stream');
var pump = require('substream-pump');

var ContextVersion = require('models/mongo/context-version');
var Docker = require('models/apis/docker');
var error = require('error');
var dogstatsd = require('models/datadog');

module.exports.buildStreamHandler = buildStream;

var baseDataName = 'api.socket.build';

function buildStream (socket, id, data) {
  dogstatsd.increment(baseDataName+'.connections');
  // check required args
  if (!data.id || !data.streamId) {
    dogstatsd.increment(baseDataName+'.err.invalid_args');
    return writeErr('data.id and data.streamId are required');
  }

  ContextVersion.findOne({_id: data.id}, function (err, version) {
    if (err) {
      dogstatsd.increment(baseDataName+'.err.no_ContextVersion_1');
      return writeErr('could not find build in database');
    }
    if (!validateVersion(version)) {
      // Grab the stream from the socket using the containerId
      var clientStream = socket.substream(data.streamId);

      // check if build already completed
      if (version.build && version.build.completed && version.build.log)  {
        debug('build already built');
        dogstatsd.increment(baseDataName+'.build_built');
        clientStream.write(createFrame(1, version.build.log)); // 1 indicates stdout
        return clientStream.end();
      }
      pipeBuildLogsToClient(version, clientStream);
    }
  });
  function writeErr (errMessage, version) {
    debug('writeErr', errMessage);
    if (socket.writable) {
      debug(errMessage);
      socket.write({
        id: id,
        error: errMessage,
        data: version
      });
    }
    return true;
  }
  function validateVersion (version) {
    debug('validateVersion');
    if (!version) {
      return writeErr('version not found', version);
    }
    if (!version.dockerHost || !version.containerId) {
      dogstatsd.increment(baseDataName+'.err.invalid_version');
      return writeErr('dockerHost or containerId not found in version', version);
    }
  }
  function pipeBuildLogsToClient (version, clientStream) {
    debug('pipeBuildLogsToClient');
    var docker = new Docker(version.dockerHost);
    // make sure client stream is still writable
    if (!clientStream.stream) { return; }
    docker.getLogs(version.containerId, process.env.DOCKER_BUILD_LOG_TAIL_LIMIT,
      function (err, dockerLogStream) {
        if (err) { return writeLogError(err); }
        dockerLogStream.setEncoding('hex');
        pump(dockerLogStream, clientStream, function (err) {
          if (err) { return writeLogError(err); }
        });
        dogstatsd.captureSteamData(baseDataName+'.dockerLogStream', dockerLogStream);
        dogstatsd.captureSteamData(baseDataName+'.clientStream', clientStream);
      });
    function writeLogError (err) {
      debug('writeLogErr', err);
      dogstatsd.increment(baseDataName+'.err.getting_logs', ['dockerHost:'+version.dockerHost]);
      error.log(err);
      return writeErr(err.messsage, version);
    }
  }
}
