'use strict';
var debug = require('debug')('runnable-api:socket:log-stream');
var Docker = require('models/apis/docker');

function logHandler (socket, id, data) {
  // check required args
  if (!data.dockHost ||
    !data.containerId) {
    return socket.write({
      id: id,
      error: 'dockHost and containerId are required',
      data: data
    });
  }

  // Grab the stream from the socket using the containerId
  var destLogStream = socket.substream(data.containerId);
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
    }
  });

  // return to client id to listen too
  socket.write({
    id: id,
    event: 'LOG_STREAM_CREATED',
    data: {
      substreamId: data.containerId
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
    des.write(data.toString());
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

  des.on('end', function() {
    if (src.end) {
      src.end();
    }
  });
}

module.exports.logStreamHandler = logHandler;