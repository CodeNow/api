'use strict';
var redis = require('redis');
var configs = require('configs');
var reader = redis.createClient(configs.redis.port, configs.redis.ipaddress);
var writer = redis.createClient(configs.redis.port, configs.redis.ipaddress);

function attachInputStreamToRedis (id, writeStream) {
  writeStream.on('data', function(data) {
    console.log("write", data);
    writer.publish(id, data);
  });
  return writeStream;
}

function attachOutputStreamToRedis (id, readStream) {
  reader.subscribe(id);
  reader.on("message", function (channel, message) {
    readStream.write(message);
    console.log("read", message, channel);
  });
}

module.exports.attachInputStreamToRedis = attachInputStreamToRedis;
module.exports.attachOutputStreamToRedis = attachOutputStreamToRedis;
