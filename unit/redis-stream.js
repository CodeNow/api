var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var beforeEach = Lab.beforeEach;

var redis = require('redis');
var configs = require('configs');
var uuid = require('uuid');
var redisStream = require('../lib/models/redis/stream.js');


describe('redis-stream', function () {
  var roomId;
  beforeEach(function(done) {
    roomId = uuid();
    done();
  });
  it('should read stream from redis', function (done) {
    var testString = "this is another message";
    var s = new require('stream').Writable();
    s._write = function(message) {
      expect(message.toString()).to.equal(testString);
      done();
    };
    redisStream.attachOutputStreamToRedis(roomId, s);
    var writer = redis.createClient(configs.redis.port, configs.redis.ipaddress);
    writer.publish(roomId, testString);
  });
  it('should write stream to redis', function (done) {
    var testString = "this is a message";
    var reader = redis.createClient(configs.redis.port, configs.redis.ipaddress);
    reader.subscribe(roomId);
    reader.on("message", function (channel, message) {
      if (channel === "test" && message === testString) {
        reader.unsubscribe(roomId);
        return done();
      }
      expect(channel).to.equal(roomId);
      expect(message).to.equal(testString);
      return done();
    });
    var s = new require('stream').Readable();
    s.push(testString);
    s.push(null);
    redisStream.attachInputStreamToRedis(roomId, s);
  });
  it('should send data to all clients', function (done) {
    var testString = "this is yet another message";
    var numClients = 100;
    var createCount = require('callback-count');
    var count = createCount(numClients, done);

    function handleMessage(message) {
      expect(message.toString()).to.equal(testString);
      count.next();
    }

    for (var i = numClients - 1; i >= 0; i--) {
      var client1 = new require('stream').Writable();
      client1._write = handleMessage;
      redisStream.attachOutputStreamToRedis(roomId, client1);
    }

    var sendStream = new require('stream').Readable();
    sendStream.push(testString);
    sendStream.push(null);
    redisStream.attachInputStreamToRedis(roomId, sendStream);
  });
});