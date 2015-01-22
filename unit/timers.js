'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var Timers = require('models/apis/timers');
var uuid = require('uuid');
var createCount = require('callback-count');

var ctx = {};

describe('Timers', function () {
  describe('instantiation', function () {
    it('should instantiate a timer', function (done) {
      var t;
      try {
        t = new Timers();
      } catch (err) {
        done(err);
      }
      expect(t).to.not.equal(undefined);
      expect(t).to.be.an('object');
      done();
    });
  });

  describe('working with a timer', function () {
    beforeEach(function (done) {
      ctx.timer = new Timers();
      done();
    });
    afterEach(function (done) {
      delete ctx.timer;
      delete ctx.timerName;
      done();
    });
    describe('starting timers', function () {
      it('should start a timer', function (done) {
        ctx.timer.startTimer(uuid(), done);
      });
      it('should fail without a name', function (done) {
        ctx.timer.startTimer(function (err) {
          expect(err).to.be.okay;
          expect(err.message).to.match(/require a name/);
          done();
        });
      });
    });
    describe('started timers', function () {
      beforeEach(function (done) {
        ctx.timerName = uuid();
        ctx.timer.startTimer(ctx.timerName, done);
      });
      it('should start another timer', function (done) {
        ctx.timer.startTimer(uuid(), done);
      });
      it('should fail without a name', function (done) {
        ctx.timer.startTimer(function (err) {
          expect(err).to.be.okay;
          expect(err.message).to.match(/require a name/);
          done();
        });
      });
      it('should fail with a duplicate name', function (done) {
        ctx.timer.startTimer(ctx.timerName, function (err) {
          expect(err).to.be.okay;
          expect(err.message).to.match(/already exists/);
          done();
        });
      });
    });
    describe('stopping timers', function () {
      beforeEach(function (done) {
        ctx.timerName = uuid();
        ctx.timer.startTimer(ctx.timerName, done);
      });
      it('should stop a timer', function (done) {
        var count = createCount(2, done);
        ctx.timer_debug = ctx.timer.debug;
        ctx.timer.debug = function () {
          expect(arguments[0]).to.equal(ctx.timerName);
          expect(arguments[1]).to.match(/\d+s, \d?\.?\d+ms/);
          ctx.timer.debug = ctx.timer_debug;
          ctx.timer.debug.apply(ctx.timer, arguments);
          count.next();
        };
        ctx.timer.stopTimer(ctx.timerName, count.next);
      });
      it('should fail without a name', function (done) {
        ctx.timer.stopTimer(function (err) {
          expect(err).to.be.okay;
          expect(err.message).to.match(/require a name/);
          done();
        });
      });
      it('should fail with a name that does not exist', function (done) {
        ctx.timer.stopTimer(uuid(), function (err) {
          expect(err).to.be.okay;
          expect(err.message).to.match(/does not exist/);
          done();
        });
      });
    });
    describe('stopped timers', function () {
      beforeEach(function (done) {
        ctx.timerName = uuid();
        ctx.timer.startTimer(ctx.timerName, done);
      });
      beforeEach(function (done) {
        ctx.timer.stopTimer(ctx.timerName, done);
      });
      it('should be able to start with the same name', function (done) {
        ctx.timer.startTimer(ctx.timerName, done);
      });
      it('should not stop again', function (done) {
        ctx.timer.stopTimer(ctx.timerName, function (err) {
          expect(err).to.be.okay;
          expect(err.message).to.match(/does not exist/);
          done();
        });
      });
    });
  });
});
