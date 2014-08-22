'use strict';
var debug = require('debug')('runnable-api:socket:build-stream');
var redis = require('models/redis');
var publisher = redis.createClient();
var subscriber = redis.createClient();
var Queue = require('async').queue;
var dockerCleaner = require('docker-stream-cleanser');
/**
 * The BuildStream object handles listening to the build stream from a container, and passes all of
 * the data to all clients listening.  Since clients can come in at any time, we buffer everything
 * from the stream into redis, then push the data from there to each client. After each client has
 * received all of the buffered data, it can start to listen to the _data events which fire
 * when the buildstream fires its data event.  This data is passed through the pub/sub event to
 * each client.  When the buildstream is ended, the publisher sends the full log through the _end
 * message.  This then calls the endCallback, cleaning up for the client.
 */


/**
 * Keyed by the streamId they are listening to, then of the SocketId that the queue belongs to.
 * This map contains all of the queues used to send the clients data
 *
 * @type {{}}
 */
var clientQueues = {};

/**
 * This is a map of SocketIds that have connected to this service.  This will be checked before
 * we connect the end and close events on the socket to make sure that we only apply these
 * listeners once.
 * @type {{}}
 */
var socketsConnected = {};

/**
 * Used for alerting clients of data and the build stream ending
 */
subscriber.on('message', function(channel, data) {
  // remove ping from message
  var messageInfo = channel.split('_');
  var streamId = messageInfo[0];
  var reason = messageInfo[1];

  var callback = (reason === 'data') ? queueCallback : endingCallback;

  if (clientQueues[streamId]) {
    Object.keys(clientQueues[streamId]).forEach(function (socketId) {
      clientQueues[streamId][socketId].push({ data: data }, callback);
    });
  }
});

/**
 * Callback used to help clean up after a client has disconnected before the buildstream has
 * finished
 * @param streamId
 * @param socket
 * @returns {Function} callback
 */
function onClientSocketDisconnect(streamId, socket) {
  var socketId = socket.id;
  return function() {
    clearMapsOfClient(streamId, socketId);
    socket.removeListener('end', onClientSocketDisconnect(streamId, socket));
    socket.removeListener('close', onClientSocketDisconnect(streamId, socket));
    if (socketsConnected[socketId]) {
      delete socketsConnected[socketId];
    }
  };
}
/**
 * This is called every time a new client is connected to the system.  We use this to setup all the
 * cleanup stuff, as well as add the initial data query to the queue.  This ends with the redis
 * query to check the current Time To Live of the buffer to determine the state of the build stream.
 * @param socket Unique Socket established between us and the user
 * @param id Session Id
 * @param data (streamId)
 * @returns {*}
 */
/*jshint maxcomplexity:7*/
function buildStreamHandler (socket, id, data) {
  /*jshint maxcomplexity:7*/
  // check required args
  if (!data.id ||
    !data.streamId) {

    if (socket.writable) {
      return socket.write({
        id: id,
        error: 'data.id and data.streamId are required'
      });
    }
  } else {
    data.substreamId = data.streamId;
    // If the stream isn't in this map, it could still be in redis, so we won't return
    // BUILD_NOT_FOUND until we check redis
    setupSocketDisconnectEvents(socket, data.id);

    subscriber.subscribe(data.id + '_data');
    subscriber.subscribe(data.id + '_end');
    if (socket.writable) {
      socket.write({
        id: id,
        event: 'BUILD_STREAM_CREATED',
        data: data
      });
    }

    var clientStream = socket.substream(data.streamId);

    var buildEndedMessage =  {
      id: id,
      event: 'BUILD_STREAM_ENDED',
      data: data
    };
    var queue = new Queue(queueFunction(clientStream, socket, buildEndedMessage), 1);

    // First thing to check is the TTL on the stream in redis.  Once we get that response,
    // we can handle everything else
    publisher.ttl(data.streamId, onFirstConnection(queue, data.streamId, clientStream, socket,
      buildEndedMessage));
  }
}

/**
 * This should be called when a client first connects to listen the the data from the buildstream.
 * When the TTL event comes back,
 * @param queue queue created for this client.
 * @param streamId streamId for the build stream
 * @param client client substream
 * @param socket socket
 * @param socketEndingMessage message to send the client at the end of the stream
 * @returns {Function} Callback used for the TTL query.  If the ttl is -2, report that the build
 *                     stream doesn't exist, and clean up.  If it's -1, just query for the data
 *                     that's in the buffer, and use the normal callback.  If the ttl has been set,
 *                     then just push the data through to the ending callback.
 */
function onFirstConnection(queue, streamId, client, socket, socketEndingMessage) {
  /*jshint maxdepth:3 */
  return function (err, ttl) {
    if (ttl < -1) {
      // If the ttl is less than -1, than it doesn't exist, and we should let the client know
      socket.write({
        id: socketEndingMessage.id,
        error: 'Build Stream not found for ' + streamId
      });
      endingCallback(err, null, client, socket, socketEndingMessage);
    } else {
      var callback = (ttl === -1) ? queueCallback : endingCallback;
      queue.push({
        socketId: socket.id,
        streamId: streamId,
        fp: 0,
        tp: -1
      }, callback);
      if (ttl === -1) {
        // TTL of -1 means the data is in redis, but it doesn't have a TTL.  That means the
        // stream is alive, and we need to schedule the first data packet

        if (! clientQueues[streamId]) {
          clientQueues[streamId] = {};
        }
        clientQueues[streamId][socket.id] = queue;
      }
    }
  };
}
/*jshint maxdepth:2 */
/**
 * This function just sets up a lot of handlers
 * @param socket
 * @param streamId
 */
function setupSocketDisconnectEvents(socket, streamId) {
  if (!socketsConnected[socket.id]) {
    socket.on('close', onClientSocketDisconnect(streamId, socket));
    socket.on('end', onClientSocketDisconnect(streamId, socket));
    socketsConnected[socket.id] = true;
  }
}

/**
 * Helper function to remove the client from all of the maps used.
 * @param streamId
 * @param socketId
 */
function clearMapsOfClient(streamId, socketId) {
  if (clientQueues[streamId] && clientQueues[streamId][socketId]) {
    delete clientQueues[streamId][socketId];
    if (! Object.keys(clientQueues[streamId]).length) {
      subscriber.unsubscribe(streamId + '_data');
      subscriber.unsubscribe(streamId + '_end');
      delete clientQueues[streamId];
    }
  }
}

/**
 * This takes a build stream from a container and sets up the events to listen to the data
 *
 * @param id of the Source Stream
 * @param buildStream Build Stream from the container
 * @returns {*}
 */
function sendBuildStream (id, buildStream) {
  // Add the events onto the buildstream
  buildStream.on('data', onBuildStreamData(id));
  buildStream.on('end', cleanBuildStreamEvents);
  // add a value into redis so that the TTL query will report a -1
  publisher.append(id, '', function () {
    return buildStream;
  });
}

/**
 * Cleans up the buildstream events
 * @param buildStream
 * @param id
 * @returns {Function}
 */
function cleanBuildStreamEvents (buildStream, id) {
  return function() {
    buildStream.removeEventListener('data', onBuildStreamData(id));
    buildStream.removeEventListener('end', cleanBuildStreamEvents(buildStream, id));
  };
}

/**
 * This function returns the callback to be used as the queue's worker function
 * @param client client substream
 * @param socket socket the client is connected through
 * @param socketEndingMessage message to send through the socket at the end, or if an error occurs
 * @returns {Function} returns the function to be used as the queue worker.  If the task
 *                      object contains data, then just pass that along to be written.  Otherwise,
 *                      Redis is queried and the data is sent to the callback
 */
function queueFunction(client, socket, socketEndingMessage) {
  return function(task, cb) {
    if (task.data) {
      // if the data was sent in the task, don't query redis
      cb(null, task.data, client, socket, socketEndingMessage);
    } else {
      var streamId = task.streamId;
      publisher.getrange(streamId, task.fp, task.tp, function (err, bufferData) {
        cb(err, bufferData, client, socket, socketEndingMessage);
      });
    }
  };
}

/**
 * Queue Callback that should be used for normal 'piping'.  Whenever data is put into the queue to
 * be written through the substream, this is the callback that should be used.
 * @param err err
 * @param bufferData data that should be written to the client's substream
 * @param client client substream
 * @param socket socket connection between us and the client
 * @param socketEndingMessage ending message that should be written on the socket if an error occurs
 * @returns {*}
 */
function queueCallback(err, bufferData, client, socket, socketEndingMessage) {
  /*jshint maxdepth:3 */
  if (!err) {
    // Check to make sure the socket is writable
    try {
      if (bufferData) {
        client.write(bufferData);
      }
    } catch (err) {
      // ignore
      console.error('BuildStream client write error: ', err);
      debug('*** Client write FAILURE *****', err);
    }
  } else {
    socketEndingMessage.error = err;
    if (socket.writable) {
      socket.write(socketEndingMessage);
    }
  }
  /*jshint maxdepth:2 */
}

/**
 * Queue Callback that should be used when the build stream has finished.  This appends the data
 * to the socket message as the data.log, sends it, then cleans up everything for the client.
 * @param err error
 * @param fullData Entire Build Log from redis
 * @param client client substream
 * @param socket socket connection between us and the client
 * @param socketEndingMessage message to send through the socket
 */
function endingCallback(err, fullData, client, socket, socketEndingMessage) {
  socketEndingMessage.data.log = fullData;
  if (err) {
    socketEndingMessage.error = err;
  }
  // send the final message with the Log data back to the client
  if (socket.writable) {
    socket.write(socketEndingMessage);
  }

  clearMapsOfClient(socketEndingMessage.data.id, socket.id);
  if (client) {
    // Now kill the stream
    client.end();
  }
}

/**
 * This returns the function used to handle the data event from the buildstream
 * The callback should first attempt to append the data to the buffer, then add the length to each
 * connected client's clientPendingData counter.  Once all of the maps have been updated, fire
 * the signal for the clients to read it.
 */
function onBuildStreamData(id) {
  return function(data) {
    if (data) {
      var fixedData = dockerCleaner(data);
      // Append the data to the buffer in redis
      publisher.append(id, fixedData, function(err) {
        if (err) {
          debug('Build Appending Error: ', err);
        }
        publisher.publish(id + '_data', fixedData);
      });
    }
  };
}

/**
 * Retrieves the build log buffer from redis for this build
 * @param id
 * @param cb
 */
function getBuildLog (id, cb) {
  publisher.get(id, cb);
}
/**
 * THIS SHOULD BE CALLED ONLY WHEN THE BUILD HAS FINISHED AND LOGS SAVED IN THE DB
 *
 * First, this method should get all of the data it has stored in it's buffer (in Redis).  Once that
 * returns, destory the ping signal, call cleanup on all the remaining connected clients, delete
 * it's map entries, then finally, put an expiration time on the Redis buffer.
 * @param id StreamId
 * @param cb callback
 */
function endBuildStream (id, cb) {
  // First, clean up all of the clients connected

  // If we are here, then the build stream has been closed
  publisher.get(id, function(err, bufferData) {
    if (err) { return cb(err); }

    publisher.publish(id + '_end', bufferData);

    // Set the expiration time for the log data to REDIS_KEY_EXPIRES
    debug('Setting '+ id+' key in Redis to expire in ', process.env.REDIS_KEY_EXPIRES);
    publisher.pexpire(id, process.env.REDIS_KEY_EXPIRES, cb);

    subscriber.unsubscribe(id + '_data');
    subscriber.unsubscribe(id + '_end');
  });
}

module.exports.buildStreamHandler = buildStreamHandler;
module.exports.sendBuildStream = sendBuildStream;
module.exports.getBuildLog = getBuildLog;
module.exports.endBuildStream = endBuildStream;
