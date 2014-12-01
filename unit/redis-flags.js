'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var after = Lab.after;
var before = Lab.before;
var afterEach = Lab.afterEach;
var beforeEach = Lab.beforeEach;
var createCount = require('callback-count');
var redis = require('models/redis');
var RedisFlag = require('models/redis/flags');
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

describe('Redis Flags', function () {

  describe('get', function () {
    before(redisCleaner);
    after(redisCleaner);

    it('should return null for non-existing flag', function (done) {
      var flag = new RedisFlag();
      flag.get('some-key', 'some-suffix', function (err, value) {
        expect(err).to.be.null();
        expect(value).to.be.null();
        done();
      });
    });

  });

  describe('set/get/del/get', function () {
    // after(redisCleaner);
    it('should save new flag', function (done) {
      var flag = new RedisFlag();
      flag.set('some-new-key', 'some-suffix', 'some-value', function (err, value) {
        expect(err).to.be.null();
        expect(value).to.equal('OK');
        done();
      });
    });

    it('should get just saved flag', function (done) {
      var flag = new RedisFlag();
      flag.get('some-new-key', 'some-suffix', function (err, value) {
        expect(err).to.be.null();
        expect(value).to.equal('some-value');
        done();
      });
    });

    it('should del flag', function (done) {
      var flag = new RedisFlag();
      flag.del('some-new-key', 'some-suffix', function (err, value) {
        expect(err).to.be.null();
        expect(value).to.equal('1');
        done();
      });
    });

    it('should get null for deleted flag', function (done) {
      var flag = new RedisFlag();
      flag.get('some-new-key', 'some-suffix', function (err, value) {
        expect(err).to.be.null();
        expect(value).to.be.null();
        done();
      });
    });

  });

});