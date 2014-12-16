'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var after = Lab.after;
var before = Lab.before;
var expect = Lab.expect;
var redis = require('models/redis');
var activeApi = require('models/redis/active-api');

require('loadenv')();

describe('Active API', function () {
  var ctx = {};
  describe('isMe', function () {
    before(redis.flushdb.bind(redis));
    after(redis.flushdb.bind(redis));

    it('should return false if setAsMe was never called', function (done) {
      activeApi.isMe(function (err, isActive) {
        if (err) { return done(err); }
        expect(isActive).to.equal(false);
        done();
      });
    });

  });

  describe('setAsMe', function () {
    before(redis.flushdb.bind(redis));
    after(redis.flushdb.bind(redis));

    before(function (done) {
      ctx.originUUID = process.env.UUID;
      done();
    });

    after(function (done) {
      process.env.UUID = ctx.originUUID;
      done();
    });


    it('should return success if key was set', function (done) {
      activeApi.setAsMe(function (err, isSet) {
        if (err) { return done(err); }
        expect(isSet).to.equal(true);
        done();
      });
    });

    it('should return isMe as true', function (done) {
      activeApi.isMe(function (err, isActive) {
        if (err) { return done(err); }
        expect(isActive).to.equal(true);
        done();
      });
    });

    it('should throw an error if process.env.UUID is null', function (done) {
      process.env.UUID = null;
      try {
        activeApi.setAsMe(function (err, isSet) {
          if (err) { return done(err); }
          expect(isSet).to.equal(true);
        });
      }
      catch (err) {
        expect(err.message).to.equal('ActiveApi has not been set with a uuid.');
        done();
      }
    });

  });

});