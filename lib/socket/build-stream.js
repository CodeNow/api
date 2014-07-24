'use strict';
var redisStream = require('../models/redis/stream.js');
var debug = require('debug')('runnable-api:socket:build-stream');
var redis = require('models/redis');
function buildStreamHandeler (socket, id, data) {
  // check required args
  if (!data.id) {
    return socket.write({
      id: id,
      error: 'data.id required'
    });
  }
  // return to client id to listen too
  socket.write({
    id: id,
    event: 'BUILD_STREAM_CREATED',
    data: {
      substreamId: data.id
    }
  });

  debug('attach stream to'+data.id);
  var buildStream = socket.substream(data.id);
  // push buffer
  redis.get(data.id+'_data', function(err, data) {
    // ignore errors
    if (err || !data) {
      debug('error getting logs', err);
    } else {
      buildStream.write(data);
    }
  });
  redisStream.attachOutputStreamToRedis(data.id+'_stream', buildStream);

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