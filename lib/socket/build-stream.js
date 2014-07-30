'use strict';
var redisStream = require('../models/redis/stream.js');
var debug = require('debug')('runnable-api:socket:build-stream');
var redis = require('models/redis');
var publisher = redis.createClient();
var subscriber = redis.createClient();

function streamHandler (socket, id, data) {
  // check required args
  if (!data.id ||
    !data.streamId) {
    return socket.write({
      id: id,
      error: 'data.id and data.streamId are required'
    });
  }

  debug('attach stream to', data);
  var buildStream = socket.substream(data.streamId);


  // '_data' used for buffer
  publisher.get(data.id+'_data', function(err, bufferData) {
    // ignore errors
    if (err || !bufferData) {
      debug('error getting logs', err);
    } else {
      buildStream.write(bufferData);
    }
    // '_stream' used for live stream of logs
    redisStream.attachOutputStreamToRedis(data.id+'_stream', buildStream);
  });

  // '_message' used for ending the stream
  subscriber.subscribe(data.id + '_message');
  subscriber.on('message', function(ch) {
    if (data.id+'_message' === ch) {
      publisher.get(data.id+'_data', function(err, log) {
        buildStream.end();
        // return to client id to listen too
        socket.write({
          id: id,
          event: 'BUILD_STREAM_ENDED',
          data: {
            substreamId: data.id,
            log: log
          }
        });
        // cleanup
        subscriber.unsubscribe(data.id + '_message');
        publisher.del(data.id + '_data');
      });
    }
  });

  // return to client id to listen too
  socket.write({
    id: id,
    event: 'BUILD_STREAM_CREATED',
    data: {
      substreamId: data.id
    }
  });
}

function sendStream (id, stream) {
  redisStream.attachInputStreamToRedis(id+'_stream', stream);
  stream.on('data', function(data) {
    publisher.append(id+'_data', data);
  });
  return stream;
}

function getBufferLog (id, cb) {
  publisher.get(id+'_data', cb);
}

function endStream (id, cb) {
  publisher.publish(id+'_message', 'end', cb);
}

module.exports.streamHandler = streamHandler;
module.exports.sendStream = sendStream;
module.exports.getBufferLog = getBufferLog;
module.exports.endStream = endStream;
