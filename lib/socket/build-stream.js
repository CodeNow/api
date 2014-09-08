'use strict';
var debug = require('debug')('runnable-api:socket:build-stream');
var Docker = require('models/apis/docker');
var dockerCleaner = require('docker-stream-cleanser');
var ContextVersion = require('models/mongo/context-version');

// TODO: FIXME: HACK:
// remove this file!!! use logs stream for all
// inorder to do this we have to send build container in build route

/*jshint maxcomplexity:7*/
function buildStream (socket, id, data) {
  // check required args
  if (!data.id ||
    !data.streamId) {

    if (socket.writable) {
      return socket.write({
        id: id,
        error: 'data.id and data.streamId are required'
      });
    }
  }

  ContextVersion.findOne({_id: data.id}, function (err, version) {
    if (err) {
      if (socket.writable) {
        debug('could not find build in database');
        return socket.write({
          id: id,
          error: 'could not find build in database'
        });
      }
    }

    if(!version.dockerHost || !version.containerId) {
      if (socket.writable) {
        debug('dockerHost or containerId not found in version');
        return socket.write({
          id: id,
          error: 'dockerHost or containerId not found in version',
          data: version
        });
      }
    }
    // check if build already completed
    if(version.build &&
      version.build.completed &&
      version.build.log)  {
      debug('build already built');
      return sendEndEvent(socket, id, data, version);
    }

    data.dockHost = version.dockerHost;
    data.containerId = version.containerId;

    // Grab the stream from the socket using the containerId
    var destLogStream = socket.substream(data.streamId);
    // Now call the Docker.getLogs function to
    var docker = new Docker(data.dockHost);
    docker.getLogs(data.containerId, function (err, dockerLogStream) {
      if (err) {
        debug('Container getLogs error' + err);
        return socket.write({
          id: id,
          error: err,
          data: data
        });
      } else {
        joinStreams(dockerLogStream, destLogStream);
        joinEnds(dockerLogStream, destLogStream);
        dockerLogStream.on('end', handleLogStreamEnd(socket, id, data));
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
 * @param  {object} socket socket to which to write
 * @param  {int} id id of message
 * @param  {object} data data of message
 * @return {function} function to give to on end event of log stream
 */
function handleLogStreamEnd (socket, id, data) {
  return function() {
    // start polling for on complete event. only then send end event
    ContextVersion.findOne({_id: data.id}, function (err, version) {
      if (err) {
        if (socket.writable) {
          return socket.write({
            id: id,
            error: 'could not find build in database'
          });
        }
      }

      if(!version || (version.build && !version.build.completed))  {
        return setTimeout(handleLogStreamEnd(socket, id, data), process.env.BUILD_END_TIMEOUT);
      }
      sendEndEvent(socket, id, data, version);
    });
  };
}

// sends end message to client
function sendEndEvent(socket, id, data, version) {
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
 * source to destination
 * @param src Source (Readable) Stream
 * @param des Destination (Writeable) Stream
 */
function joinStreams(src, des) {
  src.on('data', function(data) {
    if (des.stream) {
      des.write(dockerCleaner(data).toString());
    }
  });
}

/**
 * Connects the onEnd events of both the source and destination streams together so that when one
 * ends, the other one does as well
 * @param src Source (Readable) Stream
 * @param des Destination (Writeable) Stream
 */
function joinEnds(src, des) {
  src.on('end', function() {
    if (des.end) {
      des.end();
    }
  });

  des.on('finish', function() {
    if (src.end) {
      src.off('data');
      src.end();
    }
  });
}

module.exports.buildStreamHandler = buildStream;