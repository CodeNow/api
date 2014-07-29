'use strict';
var debug = require('debug')('runnable-api:socket:log-stream');

function logHandler (socket, id, data) {
  // check required args
  if (!data.dockPort ||
    !data.dockHost ||
    !data.containerId) {
    return socket.write({
      id: id,
      error: 'dockPort, dockHost, containerId are required',
      data: data
    });
  }

  // Grab the stream from the socket using the containerId
  var destLogStream = socket.substream(data.containerId);
  // Now call the Docker.getLogs function to
  var docker = new Docker(data.dockHost);
  docker.getLogs(data.containerId, data.dockerHost, function (err, dockerLogStream) {
    if (err) {
      debug('Container getLogs error' + err);
      return socket.write({
        id: id,
        error: err,
        data: data
      });
    }
    joinStreams(dockerLogStream, destLogStream);
    joinEnds(dockerLogStream, destLogStream);
  });

  // return to client id to listen too
  socket.write({
    id: id,
    event: 'LOG_STREAM_CREATED',
    data: {
      substreamId: containerId
    }
  });
}

/**
 * Simply links the sources onData handler to the destination's write, thus piping the data from
 * source to destination
 * @param src Source (Readable) Stream
 * @param des Destination (Writeable) Stream
 */
function joinStreams(src, des) {
  src.on('data', function(data) {
    des.write(data);
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
    des.end();
  });

  des.on('end', function() {
    src.end();
  });
}

module.exports.logStreamHandler = logHandler;