'use strict';
var redis = require('redis');

function attachInputStreamToRedis (id, writeStream) {
  var writer = redis.createClient(process.env.REDIS_PORT, process.env.REDIS_IPADDRESS);
  writeStream.on('data', function(data) {
    writer.publish(id, data);
  });
  writeStream.on("end", function () {
    writer.publish(id+'_msg', 'end');
    writer.del(id+'_msg', id);
    writer.quit();
  });
}

function attachOutputStreamToRedis (id, readStream) {
  var reader = redis.createClient(configs.redis.port, configs.redis.ipaddress);
  reader.subscribe(id, id+'_msg');
  reader.on("message", function (channel, message) {
    if (~channel.indexOf(id+'_msg')) {
      return readStream.end();
    }
    readStream.write(message);
  });
  readStream.on('end', function () {
    reader.quit();
  });
}

module.exports.attachInputStreamToRedis = attachInputStreamToRedis;
module.exports.attachOutputStreamToRedis = attachOutputStreamToRedis;
