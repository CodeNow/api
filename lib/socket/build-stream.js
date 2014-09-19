'use strict';
var debug = require('debug')('runnable-api:socket:build-stream');
var Docker = require('models/apis/docker');
var ContextVersion = require('models/mongo/context-version');
var dogstatsd = require('../models/datadog');
var baseDataName = 'api.socket.build';
// TODO: FIXME: HACK:
// remove this file!!! use logs stream for all
// inorder to do this we have to send build container in build route

/*jshint maxcomplexity:7*/
function buildStream (socket, id, data) {
  dogstatsd.increment(baseDataName+'.connections');
  // check required args
  if (!data.id ||
    !data.streamId) {
    dogstatsd.increment(baseDataName+'.err.invalid_args');
    if (socket.writable) {
      return socket.write({
        id: id,
        error: 'data.id and data.streamId are required'
      });
    }
  }

  ContextVersion.findOne({_id: data.id}, function (err, version) {
    if (err) {
      dogstatsd.increment(baseDataName+'.err.no_ContextVersion_1');
      if (socket.writable) {
        debug('could not find build in database');
        return socket.write({
          id: id,
          error: 'could not find build in database'
        });
      }
    }

    if(!version.dockerHost || !version.containerId) {
        dogstatsd.increment(baseDataName+'.err.invalid_version');
      if (socket.writable) {
        debug('dockerHost or containerId not found in version');
        return socket.write({
          id: id,
          error: 'dockerHost or containerId not found in version',
          data: version
        });
      }
    }
    // Grab the stream from the socket using the containerId
    var clientStream = socket.substream(data.streamId);

    // check if build already completed
    if(version.build &&
      version.build.completed &&
      version.build.log)  {
      debug('build already built');
      dogstatsd.increment(baseDataName+'.build_built');
      return sendEndEvent(clientStream, socket, id, data, version);
    }

    data.dockHost = version.dockerHost;
    data.containerId = version.containerId;

    // Now call the Docker.getLogs function to
    var docker = new Docker(data.dockHost);
    docker.getLogs(data.containerId, function (err, dockerLogStream) {
      if (err) {
        dogstatsd.increment(baseDataName+'.err.getting_logs', ['dockerHost:'+data.dockerHost]);
        debug('Container getLogs error' + err);
        return socket.write({
          id: id,
          error: err,
          data: data
        });
      } else {
        joinStreams(dockerLogStream, clientStream);
        dockerLogStream.on('end', handleLogStreamEnd(clientStream, socket, id, data));
        dogstatsd.captureSteamData(baseDataName+'.dockerLogStream', dockerLogStream);
        dogstatsd.captureSteamData(baseDataName+'.clientStream', clientStream);
      }
    });

    // return to client id to listen too
    socket.write({
      id: id,
      event: 'BUILD_STREAM_CREATED',
      data: {
        substreamId: data.streamId
      }
    });
  });
}

/**
 * when logs stream ends, send end event only when mongo has been updated
 * @param  {object} clientStream
 * @param  {object} socket socket to which to write
 * @param  {int} id id of message
 * @param  {object} data data of message
 * @return {function} function to give to on end event of log stream
 */
function handleLogStreamEnd (clientStream, socket, id, data) {
  return function() {
    // start polling for on complete event. only then send end event
    ContextVersion.findOne({_id: data.id}, function (err, version) {
      if (err) {
        dogstatsd.increment(baseDataName+'.err.no_ContextVersion_2');
        if (socket.writable) {
          return socket.write({
            id: id,
            error: 'could not find build in database'
          });
        }
      }

      if(!version || (version.build && !version.build.completed))  {
        dogstatsd.increment(baseDataName+'.retry_build_poll');
        return setTimeout(handleLogStreamEnd(clientStream, socket, id, data),
          process.env.BUILD_END_TIMEOUT);
      }
      sendEndEvent(clientStream, socket, id, data, version);
    });
  };
}

// sends end message to client
function sendEndEvent(clientStream, socket, id, data, version) {
  // TODO: HACK: FIXME:
  // this is a hack. remove this and use the socket event to say when build is done
  clientStream.end();
  dogstatsd.increment(baseDataName+'.end_event');
  if (socket.writable) {
    socket.write({
      id: id,
      event: 'BUILD_STREAM_ENDED',
      data: {
        id: data.streamId,
        log: version.build.log
      }
    });
  }
}

/**
 * Simply links the sources onData handler to the destination's write, thus piping the data from
 * source to destination.
 * @param buildStream Source (Readable) Stream
 * @param clientStream Destination (Writeable) Stream
 */
function joinStreams(buildStream, clientStream) {
  buildStream.on('data', function(data) {
    if (clientStream.stream) {
      clientStream.write(data.toString());
    }
  });
}

module.exports.buildStreamHandler = buildStream;