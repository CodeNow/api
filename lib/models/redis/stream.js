'use strict';
var redis = require('redis');

function attachInputStreamToRedis (id, writeStream) {
  var writer = redis.createClient(process.env.REDIS_PORT, process.env.REDIS_IPADDRESS);
  writeStream.on('data', function(data) {
    writer.publish(id, data);
  });
  writeStream.on("end", function () {
    writer.quit();
  });
}

function attachOutputStreamToRedis (id, readStream) {
  var reader = redis.createClient(process.env.REDIS_PORT, process.env.REDIS_IPADDRESS);
  reader.subscribe(id);
  reader.on("message", function (channel, message) {
    readStream.write(message);
  });
  readStream.on("end", function () {
    reader.quit();
  });
}

module.exports.attachInputStreamToRedis = attachInputStreamToRedis;
module.exports.attachOutputStreamToRedis = attachOutputStreamToRedis;
