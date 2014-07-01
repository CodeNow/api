var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;

var redis = require('redis');
var configs = require('configs');

var writer = redis.createClient(configs.redis.port, configs.redis.ipaddress);
var reader = redis.createClient(configs.redis.port, configs.redis.ipaddress);
var redisStream = require('../lib/models/redis/stream.js');


describe('redis-stream', function () {

  it('should write stream to redis', function (done) {
    reader.subscribe("test");
    reader.on("message", function (channel, message) {
      if (channel === "test" && message === "this is a message") {
        reader.unsubscribe("test");
        return done();
      }
      expect(channel).to.equal("test");
      expect(message).to.equal("this is a message");
      return done();
    });
    var s = new require('stream').Readable();
    s.push("this is a message");
    s.push(null);
    redisStream.attachInputStreamToRedis("test", s);
  });

  it('should read stream from redis', function (done) {
    var s = new require('stream').Writable();
    s.on('data', console.log);
    s._write = function(message) {
      expect(message.toString()).to.equal("this is another message");
      done();
    };
    redisStream.attachOutputStreamToRedis("test2", s);
    writer.publish("test2", "this is another message");
  });
});