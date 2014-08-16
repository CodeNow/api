'use strict';
var debug = require('debug')('runnable-api:socket:build-stream');
var redis = require('models/redis');
var publisher = redis.createClient();

var Queue = require('async').queue;
var dockerCleaner = require('docker-stream-cleanser');
/**
 * The BuildStream object handles listening to the build stream from a container, and passes all of
 * the data to all clients listening.  Since clients can come in at any time, we buffer everything
 * from the stream into redis, then push the data from there to each client.  The
 * clientPendingDataMap contains the amount of characters that have been pushed into the buffer
 * since the last time sent.  This is very useful, since the buffer could increment n amount of
 * times since the last time we wrote to the client.
 */


var clientMap = {};
/**
 * clientCleanupMap is a map of functions to clean up client resources (as well as send clients
 * the BUILD_STREAM_END message).  This map is keyed by StreamId, then SocketId
 * @type {{}}
 */
var clientCleanupMap = {};

var workerQueue = new Queue(queueFunction, 1);


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
  };
}
/**
 * This is called every time a new client is connected to the system.  We use this to setup all the
 * cleanup stuff, as well as add the initial data query to the queue.
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
    if (socket.writable) {
      socket.write({
        id: id,
        event: 'BUILD_STREAM_CREATED',
        data: data
      });
    }

    var clientStream = socket.substream(data.streamId);

    // Add the initial data fetch into the queue
    workerQueue.push({
      socketId: socket.id,
      streamId: data.id,
      fp: 0,
      tp: -1,
      client: clientStream
    }, queueCallback(data.id, clientStream, socket, {
      id: id,
      event: 'BUILD_STREAM_ENDED',
      data: data
    }));

    // Set up the clients cleanup function for use later
    if (clientCleanupMap[data.id]) {
      clientCleanupMap[data.id][socket.id] = cleanupClientStream(socket, {
        id: id,
        event: 'BUILD_STREAM_ENDED',
        data: data
      }, clientStream);
    }
  }
}
/**
 * This function just sets up a lot of handlers
 * @param socket
 * @param streamId
 */
function setupSocketDisconnectEvents(socket, streamId) {
  if (clientMap[streamId]) {
    socket.on('error', onClientSocketDisconnect(streamId, socket));
    socket.on('close', onClientSocketDisconnect(streamId, socket));
    socket.on('disconnection', onClientSocketDisconnect(streamId, socket));
    socket.on('end', onClientSocketDisconnect(streamId, socket));
  }
}

/**
 * Callback for when a build stream ends and all the listening clients need to receive the log.
 * This function closes the client's stream, sends out the BUILD_STREAM_ENDED message with the
 * full log from the DB, and finally cleans up the callback map
 * @param socket Socket of the client's connection
 * @param id Stream Id
 * @param data Data object sent through the stream
 * @param clientStream Clients connection stream
 */
function cleanupClientStream(socket, data, clientStream) {
  return function(bufferData) {
    data.data.log = bufferData;
    // send the final message with the Log data back to the client
    if (socket.writable) {
      socket.write(data);
    }

    clearMapsOfClient(data.data.id, socket.id);
    if (clientStream) {
      // Now kill the stream
      clientStream.end();
    }
  };
}

/**
 * Helper function to remove the client from all of the maps used.
 * @param streamId
 * @param socketId
 */
function clearMapsOfClient(streamId, socketId) {
  if (clientCleanupMap[streamId] && clientCleanupMap[streamId][socketId]) {
    delete clientCleanupMap[streamId][socketId];
  }
  if (clientMap[streamId] && clientMap[streamId][socketId]) {
    delete clientMap[streamId][socketId];
  }
}

/**
 * This takes a build stream from a container, sets up redis to buffer the stream, as well as
 * attaching the redis data buffer to listen to the incoming data.
 *
 * This should create the id_data buffer in Redis for the stream, then attach the on & end hooks
 * @param id of the Source Stream
 * @param buildStream Build Stream from the container
 * @returns {*}
 */
function sendBuildStream (id, buildStream) {
  // Create the pendingData map for this stream
  clientCleanupMap[id] = {};
  clientMap[id] = {};
  buildStream.on('data', onBuildStreamData(id));
  buildStream.on('end', cleanBuildStreamEvents);
  return buildStream;
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
 * The Queues worker function.  Each time a task is pushed into the queue, this will run with it
 * as input
 * @param task streamId: streamId,
 *              socketId: socketId
 *              client: clientStream,
 *              fp: from pointer (redis data),
 *              tp: to pointer (redis data)
 * @param cb
 */
function queueFunction(task, cb) {
  var streamId = task.streamId;
  publisher.getrange(streamId, task.fp, task.tp, cb);
  if (task.client && clientMap[streamId]) {
    clientMap[streamId][task.socketId] = task.client;
  }
}

/**
 * This function is called after each queue worker function.  After the worker grabs the right data
 * from Redis, this writes that data to the client stream
 * @param streamId
 * @param client clientStream
 * @param socket socket connected to the client
 * @param socketMessagePayload the data to write back to the client if the buildstream is not
 *        present
 * @returns {Function}
 */
function queueCallback(streamId, client, socket, socketMessagePayload) {
  return function (err, bufferData) {
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
    if (socket && !clientMap[streamId]) {
      socketMessagePayload.data.log = bufferData;
      cleanupClientStream(socket, socketMessagePayload, client)(bufferData);
      if (!bufferData) {
        // If clientPendingMap doesn't have the buildstream, and NULL comes back, then it doesn't
        // exist
        return socket.write({
          id: socketMessagePayload.id,
          error: 'Build Stream not found for ' + socketMessagePayload.data.id
        });
      }
    }
  };
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
      publisher.append(id, fixedData, function(err, length) {
        if (err) {
          debug('Build Appending Error: ', err);
          console.error('BuildStream build redis append error:', err);
        }

        // Add a task for each connected client
        if (typeof(clientMap[id]) === 'object' ) {
          Object.keys(clientMap[id]).forEach(function(socketId) {
            workerQueue.push({
              streamId: id,
              socketId: socketId,
              fp: (length - fixedData.length),
              tp: length
            }, queueCallback(id, clientMap[id][socketId]));
          });
        }
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

    Object.keys(clientCleanupMap[id]).forEach(function(socketId) {
      // Call the cleanup callbacks
      if (clientCleanupMap[id].hasOwnProperty(socketId)) {
        clientCleanupMap[id][socketId](bufferData);
      }
    });
    delete clientMap[id];
    delete clientCleanupMap[id];

    // Set the expiration time for the log data to REDIS_KEY_EXPIRES
    debug('Setting '+ id+' key in Redis to expire in ', process.env.REDIS_KEY_EXPIRES);
    publisher.pexpire(id, process.env.REDIS_KEY_EXPIRES, cb);
  });
}

module.exports.buildStreamHandler = buildStreamHandler;
module.exports.sendBuildStream = sendBuildStream;
module.exports.getBuildLog = getBuildLog;
module.exports.endBuildStream = endBuildStream;
