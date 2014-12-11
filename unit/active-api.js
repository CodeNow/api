'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var after = Lab.after;
var before = Lab.before;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var pubsub = require('models/redis/pubsub');
var error = require('error');
var dockerEvents = require('models/events/docker');
var events = require('models/events/index');
var expect = Lab.expect;
var redisCleaner = require('../test/fixtures/redis-cleaner');
var createCount = require('callback-count');
var uuid = require('uuid');
var activeApi = require('models/redis/active-api');

require('loadenv')();

describe('Active API', function () {
  var ctx = {};

  describe('isMe', function () {
    before(redisCleaner.clean('*'));
    after(redisCleaner.clean('*'));

    it('should return false if setAsMe was never called', function (done) {
      activeApi.isMe(function (err, isActive) {
        if (err) { return done(err); }
        expect(isActive).to.equal(false);
        done();
      });
    });

  });

  describe('setAsMe', function () {
    before(redisCleaner.clean('*'));
    after(redisCleaner.clean('*'));


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