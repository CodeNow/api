'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var after = Lab.after;
var before = Lab.before;
var createCount = require('callback-count');
var redis = require('models/redis');
var pubsub = require('models/redis/pubsub');
var dockerEvents = require('models/events');
var expect = Lab.expect;

require('loadenv')();



var redisCleaner = function (cb) {

  redis.keys('*', function (err, keys) {
    if (err) {
      return cb(err);
    }
    if (keys.length === 0) {
      return cb();
    }

    var count = createCount(cb);
    keys.forEach(function (key) {
      redis.del(key, count.inc().next);
    });
  });
};

describe('Docker Events', function () {

  describe('listen', function () {
    before(redisCleaner);
    after(redisCleaner);

    it('should not be possible to process event with the same uuid twice', function (done) {
      dockerEvents.listen(function (err) {
        expect(err).to.be.null();
      });
      dockerEvents.listen(function (err) {
        expect(err.output.statusCode).to.equal(409);
        expect(err.output.payload.message).to.equal('Event is currently being updated by another API host.');
        done();
      });
      var payload = {
        uuid: 1,
        ip: '192.0.0.1',
        from: 'ubuntu:base',
        id: '05a8615e0886',
        time: new Date().getTime()
      };
      pubsub.publish('runnable:docker:die', payload);
    });

  });

});