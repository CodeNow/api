'use strict';
var redisStream = require('../models/redis/stream.js');
var debug = require('debug')('runnable-api:socket:build-stream');
var redis = require('models/redis');

function attachBuildStreamHandelerToPrimus (primus) {
  // handle connection
  primus.on('connection', function (socket) {
    if (socket.query.type !== 'build-stream') {
      return;
    }
    debug('attach'+socket.query.type+' stream to'+socket.query.id);
    redis.get(socket.query.id+'_data', function(err, data) {
      // ignore errors
      if (err || !data) {
        debug('error getting logs', err);
      } else {
        socket.write(data);
      }
      redisStream.attachOutputStreamToRedis(socket.query.id+'_stream', socket);
    });
  });

  return primus;
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

module.exports.attachBuildStreamHandelerToPrimus = attachBuildStreamHandelerToPrimus;
module.exports.sendBuildStream = sendBuildStream;
module.exports.getBuildLog = getBuildLog;
module.exports.clearBuildLog = clearBuildLog;