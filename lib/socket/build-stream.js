'use strict';
var redisStream = require('../models/redis/stream.js');
var debug = require('debug')('runnable-api:socket:build-stream');
var redis = require('redis');
var publisher = redis.createClient(process.env.REDIS_PORT, process.env.REDIS_IPADDRESS);
var subscriber = redis.createClient(process.env.REDIS_PORT, process.env.REDIS_IPADDRESS);

function buildStreamHandeler (socket, id, data) {
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
        publisher.unsubscribe(data.id + '_message');
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

function sendBuildStream (id, stream) {
  redisStream.attachInputStreamToRedis(id+'_stream', stream);
  stream.on('data', function(data) {
    publisher.append(id+'_data', data);
  });
  return stream;
}

function getBuildLog (id, cb) {
  publisher.get(id+'_data', cb);
}

function endBuildStream (id, cb) {
  publisher.publish(id+'_message', 'end', cb);
}

module.exports.buildStreamHandeler = buildStreamHandeler;
module.exports.sendBuildStream = sendBuildStream;
module.exports.getBuildLog = getBuildLog;
module.exports.endBuildStream = endBuildStream;
