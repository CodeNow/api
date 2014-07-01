'use strict';
var config = require("./configs.js");
var redisStream = require('redis-stream');

function attachBuildStreamHandelerToPrimus (primus) {
  // handle connection
  primus.on('connection', function (socket) {
    if (socket.query.type !== 'build-stream') {
      return;
    }
    redisStream.attachOutputStreamToRedis(socket.query.id, socket);
  });

  return primus;
}


function sendBuildStream (id, stream) {
  redisStream.attachInputStreamToRedis(id, stream);
  return stream;
}

module.exports.attachBuildStreamHandelerToPrimus = attachBuildStreamHandelerToPrimus;
module.exports.sendBuildStream = sendBuildStream;