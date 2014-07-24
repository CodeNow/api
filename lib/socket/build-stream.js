'use strict';
var redisStream = require('../models/redis/stream.js');
var debug = require('debug')('runnable-api:socket:build-stream');
var redis = require('models/redis');
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
  // push buffer
  redis.get(data.id+'_data', function(err, bufferData) {
    // ignore errors
    if (err || !bufferData) {
      debug('error getting logs', err);
    } else {
      buildStream.write(bufferData);
    }
    redisStream.attachOutputStreamToRedis(data.id+'_stream', buildStream);
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
    redis.append(id+'_data', data);
  });
  return stream;
}

function getBuildLog (id, cb) {
  redis.get(id+'_data', cb);
}

function clearBuildLog (id, cb) {
  redis.del(id+'_data', cb);
}

module.exports.buildStreamHandeler = buildStreamHandeler;
module.exports.sendBuildStream = sendBuildStream;
module.exports.getBuildLog = getBuildLog;
module.exports.clearBuildLog = clearBuildLog;