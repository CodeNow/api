'use strict';
var redis = require('redis');
var configs = require('configs');

function attachInputStreamToRedis (id, writeStream) {
  var writer = redis.createClient(configs.redis.port, configs.redis.ipaddress);
  writeStream.on('data', function(data) {
    writer.publish(id, data);
  });
  writeStream.on("end", function () {
    writeStream.quit();
  });
}

function attachOutputStreamToRedis (id, readStream) {
  var reader = redis.createClient(configs.redis.port, configs.redis.ipaddress);
  reader.subscribe(id);
  reader.on("message", function (channel, message) {
    readStream.write(message);
  });
  reader.on("end", function () {
    readStream.quit();
  });
}

module.exports.attachInputStreamToRedis = attachInputStreamToRedis;
module.exports.attachOutputStreamToRedis = attachOutputStreamToRedis;
