'use strict';
var config = require("../configs.js");
var redisStream = require('../models/redis/stream.js');

function attachBuildStreamHandelerToPrimus (primus) {
  // handle connection
  primus.on('connection', function (socket) {
    console.log("conn", socket.query);
    if (socket.query.type !== 'build-stream') {
      return;
    }
    redisStream.attachOutputStreamToRedis(socket.query.id, socket);
  });

  return primus;
}


function sendBuildStream (id, stream) {
  console.log("Anand Send", id);
  redisStream.attachInputStreamToRedis(id, stream);
  return stream;
}

module.exports.attachBuildStreamHandelerToPrimus = attachBuildStreamHandelerToPrimus;
module.exports.sendBuildStream = sendBuildStream;