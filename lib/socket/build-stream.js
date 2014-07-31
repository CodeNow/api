'use strict';
var redisStream = require('../models/redis/stream.js');
var debug = require('debug')('runnable-api:socket:build-stream');
var redis = require('models/redis');
var publisher = redis.createClient();
var subscriber = redis.createClient();
var ContextVersion = require('models/mongo/context-version');

// This is a Double Map of Socket Channels (BuildStreamIds + _message) and SocketIds
var clientMessageCallbackMap = {};

/**
 * This listener calls all of the callbacks for each client connected to a build stream to alert
 * them of the message
 */
subscriber.on('message', function(channel, message) {
  if (clientMessageCallbackMap.hasOwnProperty(channel)) {
    for(var socketId in clientMessageCallbackMap[channel]) {
      if (clientMessageCallbackMap[channel].hasOwnProperty(socketId)) {
        clientMessageCallbackMap[channel][socketId](message);
      }
    }
    if (message === 'end') {
      subscriber.unsubscribe(channel);
    }
  }
});
function buildStreamHandler (socket, id, data) {
  // check required args
  if (!data.id ||
    !data.streamId) {
    return socket.write({
      id: id,
      error: 'data.id and data.streamId are required'
    });
  }

  debug('attach stream to', data);
  var clientStream = socket.substream(data.streamId);

  // '_data' used for buffer
  publisher.get(data.id+'_data', function(err, bufferData) {
    // ignore errors
    if (err || !bufferData) {
      debug('error getting logs', err);
    } else {
      clientStream.write(bufferData);
    }
    // '_stream' used for live stream of logs
    redisStream.attachOutputStreamToRedis(socket.id, data.id+'_stream', clientStream);
  });

  var messageHeader = data.id+'_message';
  // Add anon function to Socket Map
  if (! clientMessageCallbackMap.hasOwnProperty(messageHeader)) {
    // '_message' used for ending the stream
    subscriber.subscribe(messageHeader);
    clientMessageCallbackMap[messageHeader] = {};
  }
  if (! clientMessageCallbackMap[messageHeader].hasOwnProperty(socket.id)) {
    clientMessageCallbackMap[messageHeader][socket.id] = function( /* message */) {
      // To extend this to do more than sending the end message, switch around the message arg
      cleanupClientStream(socket, id, data, clientStream);
    };
  }

  // Return the id to the client so it can listen to the stream
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
  // If we are here, then the build stream has been closed
  ContextVersion.findOne({_id: data.id}, function(err, contextVersion) {
    clientStream.end();
    // return to client id to listen too
    socket.write({
      id: id,
      event: 'BUILD_STREAM_ENDED',
      data: {
        substreamId: data.id,
        log: contextVersion.build.log
      }
    });
    // cleanup
    var key = data.id + '_message';
    // Cleaning up the function pointer from the map
    delete clientMessageCallbackMap[key][socket.id];
  });
}

/**
 * This takes a build stream from a container, sets up redis to buffer the stream, as well as
 * attaching the redis data buffer to listen to the incoming data.
 * @param id of the Source Stream
 * @param buildStream Build Stream from the container
 * @returns {*}
 */
function sendBuildStream (id, buildStream) {
  // Connect the buildstream output to the redis stream connection
  redisStream.attachInputStreamToRedis(id+'_stream', buildStream);
  buildStream.on('data', function(data) {
    // Append the data to the buffer in redis
    publisher.append(id+'_data', data);
  });
  return buildStream;
}

/**
 * Retrieves the build log buffer from redis for this build
 * @param id
 * @param cb
 */
function getBuildLog (id, cb) {
  publisher.get(id+'_data', cb);
}
/**
 * THIS SHOULD BE CALLED ONLY WHEN THE BUILD HAS FINISHED AND LOGS SAVED IN THE DB
 *
 * This publishes the end message to all clients who are listening
 * @param id
 * @param cb
 */
function endBuildStream (id, cb) {
  publisher.publish(id+'_message', 'end', cb);
  publisher.del(id + '_data');
}

module.exports.buildStreamHandler = buildStreamHandler;
module.exports.sendBuildStream = sendBuildStream;
module.exports.getBuildLog = getBuildLog;
module.exports.endBuildStream = endBuildStream;
