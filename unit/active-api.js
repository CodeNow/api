var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var before = Lab.before;
var beforeEach = Lab.beforeEach;

require('loadenv')();
var activeApi = require('models/redis/active-api');
var redis = require('models/redis/index');
var async = require('async');
var uuid = require('uuid');

describe('ActiveApi Lock', function () {
  beforeEach(function (done) {
    redis.flushdb(done);
  });

  describe('initalizing the lock', function () {
    it('should know the uuid of the environment', function (done) {
      expect(activeApi.uuid).to.equal(process.env.UUID);
      done();
    });
    describe('if it was called twice', function () {
      var activeApi2;
      before(function (done) {
        activeApi2 = require('models/redis/active-api');
        done();
      });
      it('should return the same lock', function (done) {
        expect(activeApi2.uuid).to.equal(activeApi.uuid);
        done();
      });
    });
  });

  describe('locking with the valid lock', function () {
    it('should happen correctly', function (done) {
      activeApi.setAsMe(function (err, result, message) {
        if (err) { return done(err); }
        expect(result).to.equal(true);
        expect(message).to.be.okay;
        redis.get(process.env.REDIS_NAMESPACE + 'active-api', function (err, response) {
          if (err) { return done(err); }
          expect(response).to.equal(activeApi.uuid);
          done();
        });
      });
    });
    it('should be able to be set multiple times (series)', function (done) {
      async.series([
        setLock,
        setLock,
        setLock
      ], done);
    });
    it('should be able to be set multiple times (parallel)', function (done) {
      async.parallel([
        setLock,
        setLock,
        setLock
      ], done);
    });
    function setLock (done) {
      activeApi.setAsMe(function (err, result, message) {
        if (err) { return done(err); }
        expect(result).to.equal(true);
        expect(message).to.be.okay;
        done();
      });
    }
  });

  describe('checking if we have the lock', function () {
    beforeEach(function (done) {
      activeApi.setAsMe(done);
    });
    describe('when we do have the lock', function () {
      it('should say that we have the lock', function (done) {
        checkLock(true, done);
      });
      it('should continue to say that we have the lock (series)', function (done) {
        async.series([
          checkLock.bind(this, true),
          checkLock.bind(this, true),
          checkLock.bind(this, true),
        ], done);
      });
      it('should continue to say that we have the lock (parallel)', function (done) {
        async.parallel([
          checkLock.bind(this, true),
          checkLock.bind(this, true),
          checkLock.bind(this, true),
        ], done);
      });
    });
    describe('when we do not have the lock', function () {
      beforeEach(function (done) {
        // can't use another active api, so just change redis
        redis.set(process.env.REDIS_NAMESPACE + ':active-api-lock', uuid(), done);
      });
      it('should say that we do not have the lock', function (done) {
        checkLock(false, done);
      });
      it('should continue to say that we do not have the lock (series)', function (done) {
        async.series([
          checkLock.bind(this, false),
          checkLock.bind(this, false),
          checkLock.bind(this, false),
        ], done);
      });
      it('should continue to say that we do not have the lock (parallel)', function (done) {
        async.parallel([
          checkLock.bind(this, false),
          checkLock.bind(this, false),
          checkLock.bind(this, false),
        ], done);
      });
    });
    function checkLock(result, cb) {
      activeApi.isMe(function (err, result) {
        if (err) { return cb(err); }
        expect(result).to.equal(result);
        cb();
      });
    }
  });
});
