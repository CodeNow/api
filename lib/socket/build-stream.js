'use strict';
var debug = require('debug')('runnable-api:socket:build-stream');
var redis = require('models/redis');
var publisher = redis.createClient();
var subscriber = redis.createClient();

/**
 * The BuildStream object handles listening to the build stream from a container, and passes all of
 * the data to all clients listening.  Since clients can come in at any time, we buffer everything
 * from the stream into redis, then push the data from there to each client.  The
 * clientPendingDataMap contains the amount of characters that have been pushed into the buffer
 * since the last time sent.  This is very useful, since the buffer could increment n amount of
 * times since the last time we wrote to the client.
 */

/**
 * clientDataCallbackMap is a map of functions to use when the onData event fires from the
 * buildstream.  This function contains the clientStream on it's stack, as well as StreamId and
 * SocketId.  This map is keyed by StreamId, then SocketId
 * @type {{}}
 */
var clientDataCallbackMap = {};
/**
 * clientPendingDataMap is a map of integers which contains the amount of characters which have been
 * added to the buildStream's buffer (in Redis) since the last time data was written to the client.
 * This map is keyed by StreamId, then SocketId
 * @type {{}}
 */
var clientPendingDataMap = {};
/**
 * clientCleanupMap is a map of functions to clean up client resources (as well as send clients
 * the BUILD_STREAM_END message).  This map is keyed by StreamId, then SocketId
 * @type {{}}
 */
var clientCleanupMap = {};
/**
 * This listener calls all of the callbacks for each client connected to a build stream to alert
 * them of the message
 *
 * This should just call all of the Function Pointers for each client.  Each function should reset
 * it's PendingData counter to zero just before committing the write.
 */
subscriber.on('message', function(channel, index) {
  // remove ping from message
  var streamId = channel.split('_')[0];
  if (clientDataCallbackMap.hasOwnProperty(streamId)) {
    Object.keys(clientDataCallbackMap[streamId]).forEach(function(socketId) {
      if (clientDataCallbackMap[streamId].hasOwnProperty(socketId)) {
        clientDataCallbackMap[streamId][socketId](index);
      }
    });
  }
});

/**
 * Callback used to help clean up after a client has disconnected before the buildstream has
 * finished
 * @param streamId
 * @param socketId
 * @returns {Function} callback
 */
function onClientSocketDisconnect(streamId, socketId) {
  return function() {
    clearMapsOfClient(streamId, socketId);
  };
}
/**
 * This is called every time a new client is connected to the system.  We use this to establish the
 * data and stream connections to redis, as well as set up the the cleanup callbacks.
 *
 * What we want to do here is simple:
 *  first initialize the clients pending data to 0
 *  retrieve buffer from redis (getRange(0, -1)
 *    send buffer through stream
 *    add FunctionPointer to sub
 * @param socket Unique Socket established between us and the user
 * @param id Session Id
 * @param data (streamId)
 * @returns {*}
 */
function buildStreamHandler (socket, id, data) {
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
    // If the stream isn't in this map, it could still be in redis, so we won't return
    // BUILD_NOT_FOUND until we check redis
    setupSocketDisconnectEvents(socket, data.id);
    // Grab the latest data and send it down the pipe
    publisher.get(data.id, onFirstBufferData(socket, id, data));

    if (socket.writable) {
      data.substreamId = data.id;
      socket.write({
        id: id,
        event: 'BUILD_STREAM_CREATED',
        data: data
      });
    }
  }
}

function setupSocketDisconnectEvents(socket, streamId) {
  if (clientPendingDataMap[streamId]) {
    var socketId = socket.id;
    socket.on('error', onClientSocketDisconnect(streamId, socketId));
    socket.on('close', onClientSocketDisconnect(streamId, socketId));
    socket.on('disconnection', onClientSocketDisconnect(streamId, socketId));
    socket.on('end', onClientSocketDisconnect(streamId, socketId));

    // Init the pending data map before any async to ensure we don't miss any data later
    clientPendingDataMap[streamId][socketId] = 0;
  }
}

function onFirstBufferData(socket, id, data) {
  /*jshint maxcomplexity:8*/
  return function(err, bufferData) {
    var clientStream = socket.substream(data.streamId);
    // ignore errors
    if (clientPendingDataMap.hasOwnProperty(data.id)) {
      // Set this pointer back to zero before the async call, since we are getting all of the data
      // from this pointer
      var pointer = 0;
      if (bufferData && bufferData.length) {
        pointer = bufferData.length;
      }
      clientPendingDataMap[data.streamId][socket.id] = pointer;

      clientDataCallbackMap[data.id][socket.id] =
        onSendDataToClient(data.id, socket.id, clientStream);
      clientCleanupMap[data.id][socket.id] = cleanupClientStream(socket, id, data, clientStream);

      // Do error checking and whatnot
      if (err) {
        debug('error getting logs', err);
        console.error('BuildStream client initial redis fetch error: ', err);
      } else if (bufferData) {
        clientStream.write(bufferData);
      }
      // Don't write this data, since it's just null
    } else {
      if (!bufferData) {
        // If clientPendingMap doesn't have the buildstream, and NULL comes back, then it doesn't
        // exist
        socket.write({
          id: id,
          error: 'Build Stream not found for ' + data.id
        });
      }
      // If clientPendingDataMap doesn't have the stream, but we get data back, then call the
      // cleanup to send the logs
      return cleanupClientStream(socket, id, data, clientStream)(bufferData);
    }
  };
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
function cleanupClientStream(socket, id, data, clientStream) {
  return function(bufferData) {
    data.log = bufferData;
    data.substreamId = data.id;
    // send the final message with the Log data back to the client
    if (socket.writable) {
      socket.write({
        id: id,
        event: 'BUILD_STREAM_ENDED',
        data: data
      });
    }

    clearMapsOfClient(data.id, socket.id);
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
  if (clientDataCallbackMap[streamId] && clientDataCallbackMap[streamId][socketId]) {
    delete clientDataCallbackMap[streamId][socketId];
  }
  if (clientPendingDataMap[streamId] && clientPendingDataMap[streamId][socketId]) {
    delete clientPendingDataMap[streamId][socketId];
  }
  if (clientCleanupMap[streamId] && clientCleanupMap[streamId][socketId]) {
    delete clientCleanupMap[streamId][socketId];
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
  clientPendingDataMap[id] = {};
  clientDataCallbackMap[id] = {};
  clientCleanupMap[id] = {};
  // add this buildStreamId the the subscribers
  subscriber.subscribe(id + '_ping');
  buildStream.on('data', onBuildStreamData(id));
  return buildStream;
}

/**
 * Returns the callback that should be fired when a buildStream has received new data, and has
 * already placed it in Redis on the Buffer.  This callback should first grab the count of
 * pending characters from the clientPendingDataMap, and use it to grab the that many characters
 * off of the end of the buffer.  Since this flow could happen when a socket has disconnected,
 * we need a try/catch around it
 * @param streamId
 * @param socketId
 * @param clientStream substream between us and the client
 * @returns {Function} callback
 */
function onSendDataToClient (streamId, socketId, clientStream) {
  return function(data) {
    var pendingData = 0;
    data = parseInt(data);
    if (clientPendingDataMap.hasOwnProperty(streamId) &&
      clientPendingDataMap[streamId].hasOwnProperty(socketId)) {

      if (data > clientPendingDataMap[streamId][socketId]) {
        pendingData = clientPendingDataMap[streamId][socketId] - data;
        clientPendingDataMap[streamId][socketId] = data;
      }
    }

    publisher.getrange(streamId, pendingData, -1, function(err, bufferData) {
      // Now that we have the data, we can send it to the client

      // Check to make sure the socket is writable
      try {
        clientStream.write(bufferData);
      } catch (err) {
        // ignore
        console.error('BuildStream client write error: ', err);
        debug('*** Client write FAILURE *****', err);
      }
    });
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
      // Right now, we're just going to strip the headers that Docker sends.  If we ever want a way
      // to color certain input, don't chop off the first byte
      // 8 (unicode) bytes at the beginning of each output
      var fixedData = (data[1] === 0) ? '' : data;

      while (data.length && data[1] === 0) {
        // Read the length from the Docker Header
        var length = parseInt(data.slice(4, 8).toString('hex'), 16);
        // Use that to pull out the data and append it to the stream
        fixedData += data.slice(8, 8 + length).toString();
        data = data.slice(8 + length);
      }
      // Append the data to the buffer in redis
      publisher.append(id, fixedData, function(err, length) {
        if (err) {
          debug('Build Appending Error: ', err);
          console.error('BuildStream build redis append error:', err);
        }

        // Fire off subscriber
        publisher.publish(id + '_ping', length);
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

    subscriber.unsubscribe(id + '_ping');
    Object.keys(clientCleanupMap[id]).forEach(function(socketId) {
      // Call the cleanup callbacks
      if (clientCleanupMap[id].hasOwnProperty(socketId)) {
        clientCleanupMap[id][socketId](bufferData);
      }
    });
    delete clientDataCallbackMap[id];
    delete clientPendingDataMap[id];
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
