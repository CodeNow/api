'use strict';
var redis = require('models/redis');
var reader = redis.createClient();
var writer = redis.createClient();

var readStreamMap = {};

/**
 * To keep the amount of redis clients being created, we subscribe to it up here.
 */
reader.on('message', function (channel, message) {
  if (readStreamMap.hasOwnProperty(channel)) {
    // Send this message to every client who has subscribed to it
    for(var socketId in readStreamMap[channel]) {
      console.log('Writing to ' + channel, socketId)
      readStreamMap[channel][socketId](message);
    }
  }
});

/**
 * Attaches a stream and end callback onto the source stream.  This handles pushing data from the
 * source stream to it's cache in redis, as well as cleaning itself up on end
 * @param id Source Stream Id + the message header
 * @param sourceStream stream to treat as the source with data to send to clients (build stream)
 */
function attachInputStreamToRedis (id, sourceStream) {
  console.log('attaching ID' + id);
  sourceStream.on('data', function(data) {
    writer.publish(id, data);
  });
  sourceStream.on('end', function () {
    reader.unsubscribe(id);
  });
}

/**
 * This function attaches the output from the reader (buildStream), and writes it to all of the
 * ReadStreams (Clients) which have been subscribed to it.  We're using an array since there can be
 * many ReadStreams listening to one reader.
 * @param socketId
 * @param id
 * @param clientStream
 */
function attachOutputStreamToRedis (socketId, id, clientStream) {
  // Check id this source stream has already been
  console.log('Attaching Client: ' + socketId)
  if (! readStreamMap.hasOwnProperty(id)) {
    reader.subscribe(id);
    // If this clientStream's id isn't in the readStreamMap, then attach this listener to the end
    // call to clean up
    readStreamMap[id] = {};
  }
  // Now we need to find out if this specific client has already subscribed... which shouldn't
  // happen.
  if (! readStreamMap[id].hasOwnProperty(socketId)) {
    // Push this anon function into the readStreamMap so all client streams receive the data
    readStreamMap[id][socketId] = function(message) {
      clientStream.write(message);
    };
  }
  clientStream.on('end', function () {
    clientStreamClosed(id, socketId);
  });
}

/**
 * This should be called when a client's stream has been closed.  We should remove it's message
 * handler from the ReadStreamMap, and if no clients are left, delete the source stream from the
 * map and unsubscribe
 */
function clientStreamClosed(id, socketId) {
  delete readStreamMap[id][socketId];
  if (readStreamMap[id].length === 0) {
    delete readStreamMap[id];
  }
}

module.exports.attachInputStreamToRedis = attachInputStreamToRedis;
module.exports.attachOutputStreamToRedis = attachOutputStreamToRedis;
