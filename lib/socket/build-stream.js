'use strict';
var debug = require('debug')('runnable-api:socket:build-stream');
var redis = require('models/redis');
var publisher = redis.createClient();
var subscriber = redis.createClient();

// This is a Double Map of Socket Channels (BuildStreamIds + _message) and SocketIds
// This will contain an object with 2 things, functionPointer & pendingData
var clientDataCallbackMap = {};
var clientPendingDataMap = {};
var clientCleanupMap = {};
/**
 * This listener calls all of the callbacks for each client connected to a build stream to alert
 * them of the message
 *
 * This should just call all of the Function Pointers for each client.  Each function should reset
 * it's PendingData counter to zero just before committing the write.
 */
subscriber.on('message', function(channel, message) {
  if (clientDataCallbackMap.hasOwnProperty(message)) {
    for(var socketId in clientDataCallbackMap[message]) {
      clientDataCallbackMap[message][socketId](message, socketId);
    }
  }
});
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
    return socket.write({
      id: id,
      error: 'data.id and data.streamId are required'
    });
  }
  // If the stream isn't in this map, it could still be in redis, so we won't return
  // BUILD_NOT_FOUND until we check redis
  if (clientPendingDataMap.hasOwnProperty(data.id)) {
    // Init the pending data map before any async to ensure we don't miss any data later
    clientPendingDataMap[data.id][socket.id] = 0;
    var clientStream = socket.substream(data.streamId);
  }

  // Grab the latest data and send it down the pipe
  publisher.get(data.id, function(err, bufferData) {
    // ignore errors
//    console.log('Grabbing log from ' + data.id, bufferData);
    if (clientPendingDataMap.hasOwnProperty(data.id)) {
      clientDataCallbackMap[data.id][socket.id] = onSendDataToClient(clientStream);
      clientCleanupMap[data.id][socket.id] = cleanupClientStream(socket, id, data, clientStream);

      // Do error checking and whatnot
      if (err) {
        debug('error getting logs', err);
      } else if (!bufferData) {
//        console.log('nothing returned' + id);
        // Don't write this data, since it's just null
      } else {
        clientStream.write(bufferData);
      }
    } else if (!bufferData) {
      // If clientPendingMap doesn't have the buildstream, and NULL comes back, then it doesn't
      // exist
      return socket.write({
        id: id,
        error: 'Build Stream not found for '+ data.id
      });
    } else {
      // If clientPendingDataMap doesn't have the stream, but we get data back, then call the
      // cleanup to send the logs
      cleanupClientStream(socket, id, data, null)(bufferData);
    }
  });

  socket.write({
    id: id,
    event: 'BUILD_STREAM_CREATED',
    data: {
      substreamId: data.id
    }
  });
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
    // send the final message with the Log data back to the client
    socket.write({
      id: id,
      event: 'BUILD_STREAM_ENDED',
      data: {
        substreamId: data.id,
        log: bufferData
      }
    });

    if (clientStream) {
      // Now kill the stream
      clientStream.end();
    }
    if (clientDataCallbackMap[data.id] && clientDataCallbackMap[data.id][socket.id]) {
      delete clientDataCallbackMap[data.id][socket.id];
    }
    if (clientPendingDataMap[data.id] && clientPendingDataMap[data.id][socket.id]) {
      delete clientPendingDataMap[data.id][socket.id];
    }
    if (clientCleanupMap[data.id] && clientCleanupMap[data.id][socket.id]) {
      delete clientCleanupMap[data.id][socket.id];
    }
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

function onSendDataToClient (clientStream) {
  return function(streamId, socketId) {
    var pendingData = clientPendingDataMap[streamId][socketId];
    if (pendingData === 0) {
      return;
    }
    // Set this pointer back to zero before the async call
    clientPendingDataMap[streamId][socketId] = 0;
    publisher.getrange(streamId, -pendingData, -1, function(err, bufferData) {
      // Now that we have the data, we can send it to the client
      console.log('Writing Data: ' + streamId, bufferData)
      clientStream.write(bufferData);
    });
  }
}

/**
 * This returns the function used to handle the data event from the buildstream
 *
 * First append the data to the redis buffer, saving the output (length)
 *  on callback, iterate through all clients in PendingData
 */
function onBuildStreamData(id) {
  return function(data) {
    if (data) {
      // Append the data to the buffer in redis
      publisher.append(id, data, function(err, stuff) {
        if (clientPendingDataMap.hasOwnProperty(id)) {
          for (var socketId in clientPendingDataMap[id]) {
            clientPendingDataMap[id][socketId] += stuff;
          }
        }
        // Fire off subscriber
        publisher.publish(id + '_ping', id);
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
 * This publishes the end message to all clients who are listening
 * @param id
 * @param cb
 */
function endBuildStream (id, cb) {
  // First, clean up all of the clients connected

  // If we are here, then the build stream has been closed
  publisher.get(id, function(err, bufferData) {

    subscriber.unsubscribe(id + '_ping');
    for (var socketId in clientCleanupMap[id]) {
      // Call the cleanup callbacks
      clientCleanupMap[id][socketId](bufferData);
    }
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
