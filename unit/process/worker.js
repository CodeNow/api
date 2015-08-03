'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var beforeEach = lab.beforeEach;
var afterEach = lab.afterEach;

var sinon = require('sinon');
var last = require('101/last');
var Worker = require('process/worker');
var dogstatsd = require('models/datadog');
var mongooseControl = require('models/mongo/mongoose-control');
var keyGen = require('key-generator');
var ApiServer = require('server');
var activeApi = require('models/redis/active-api');
var redisClient = require('models/redis');
var events = require('models/events');
var pubsub = require('models/redis/pubsub');
var getCallback = function (stub) {
  sinon.assert.calledOnce(stub);
  return last(stub.firstCall.args);
};
var getCallbacks = function (stubs) {
  return stubs.map(getCallback);
};
var invoke = function (fn) {
  fn();
};

describe('Worker', function () {
  var ctx;
  beforeEach(function (done) {
    ctx = {};
    done();
  });

  describe('instance methods', function() {
    beforeEach(function (done) {
      ctx.worker = new Worker();
      done();
    });
    afterEach(function (done) {
      done();
    });

    describe('start', function () {
      beforeEach(function (done) {
        sinon.stub(dogstatsd, 'monitorStart');
        sinon.stub(mongooseControl, 'start');
        sinon.stub(ApiServer.prototype, 'start');
        sinon.stub(keyGen, 'start');
        sinon.stub(activeApi, 'setAsMe');
        sinon.stub(Worker.prototype, 'listenToProcess');
        sinon.stub(events, 'listen');
        done();
      });
      afterEach(function (done) {
        dogstatsd.monitorStart.restore();
        mongooseControl.start.restore();
        ApiServer.prototype.start.restore();
        keyGen.start.restore();
        activeApi.setAsMe.restore();
        Worker.prototype.listenToProcess.restore();
        events.listen.restore();
        done();
      });

      it('should start all api server and tasks', function (done) {
        ctx.worker.start(done);
        sinon.assert.calledWith(dogstatsd.monitorStart, sinon.match.func);
        sinon.assert.calledWith(mongooseControl.start, sinon.match.func);
        sinon.assert.calledWith(ApiServer.prototype.start, sinon.match.func);
        sinon.assert.calledWith(keyGen.start,      sinon.match.func);
        sinon.assert.calledWith(activeApi.setAsMe, sinon.match.func);
        sinon.assert.calledOnce(Worker.prototype.listenToProcess);
        getCallback(activeApi.setAsMe)();
        sinon.assert.calledOnce(events.listen);
        getCallbacks([
          dogstatsd.monitorStart,
          mongooseControl.start,
          ApiServer.prototype.start,
          keyGen.start,
        ]).forEach(invoke);
      });
    });

    describe('stop', function () {
      beforeEach(function (done) {
        sinon.stub(dogstatsd, 'monitorStop');
        sinon.stub(mongooseControl, 'stop');
        sinon.stub(ApiServer.prototype, 'stop');
        sinon.stub(keyGen, 'stop');
        sinon.stub(redisClient, 'quit');
        sinon.stub(redisClient, 'on');
        sinon.stub(pubsub, 'quit');
        sinon.stub(pubsub, 'on');
        sinon.stub(Worker.prototype, 'stopListeningToProcess');
        done();
      });
      afterEach(function (done) {
        ApiServer.prototype.stop.restore();
        dogstatsd.monitorStop.restore();
        keyGen.stop.restore();
        mongooseControl.stop.restore();
        redisClient.quit.restore();
        pubsub.quit.restore();
        redisClient.on.restore();
        pubsub.on.restore();
        Worker.prototype.stopListeningToProcess.restore();
        done();
      });

      it('should stop all api server and tasks', function (done) {
        ctx.worker.stop(done);
        sinon.assert.calledWith(ApiServer.prototype.stop, sinon.match.func);
        getCallback(ApiServer.prototype.stop)();
        sinon.assert.calledWith(dogstatsd.monitorStop, sinon.match.func);
        sinon.assert.calledWith(keyGen.stop, sinon.match.func);
        sinon.assert.calledWith(mongooseControl.stop, sinon.match.func);
        sinon.assert.calledOnce(redisClient.quit);
        sinon.assert.calledOnce(pubsub.quit);
        sinon.assert.calledWith(redisClient.on, 'end', sinon.match.func);
        sinon.assert.calledWith(pubsub.on, 'end', sinon.match.func);
        sinon.assert.calledOnce(Worker.prototype.stopListeningToProcess);
        getCallbacks([
          dogstatsd.monitorStop,
          mongooseControl.stop,
          ApiServer.prototype.stop,
          keyGen.stop,
          redisClient.on,
          pubsub.on
        ]).forEach(invoke);
      });
    });

    describe('listenToProcess', function () {
      beforeEach(function (done) {
        sinon.stub(process, 'on');
        done();
      });
      afterEach(function (done) {
        process.on.restore();
        done();
      });

      it('should attach event handlers to process', function(done) {
        ctx.worker.listenToProcess();
        sinon.assert.calledWith(process.on, 'uncaughtException');
        sinon.assert.calledWith(process.on, 'SIGINT');
        sinon.assert.calledWith(process.on, 'SIGTERM');
        done();
      });
    });

    describe('stopListeningToProcess', function () {
      beforeEach(function (done) {
        sinon.stub(process, 'removeAllListeners');
        done();
      });
      afterEach(function (done) {
        process.removeAllListeners.restore();
        done();
      });

      it('should attach event handlers to process', function(done) {
        ctx.worker.stopListeningToProcess();
        sinon.assert.calledWith(process.removeAllListeners, 'uncaughtException');
        sinon.assert.calledWith(process.removeAllListeners, 'SIGINT');
        sinon.assert.calledWith(process.removeAllListeners, 'SIGTERM');
        done();
      });
    });

    describe('handleUncaughtException', function () {
      beforeEach(function (done) {
        sinon.stub(Worker.prototype, 'stop');
        sinon.stub(Worker.prototype, 'waitForCleanExit');
        sinon.stub(process, 'exit');
        done();
      });
      afterEach(function (done) {
        Worker.prototype.stop.restore();
        Worker.prototype.waitForCleanExit.restore();
        process.exit.restore();
        done();
      });

      it('it should log the error and stop the worker', function (done) {
        var err = new Error('boom');
        ctx.worker.handleUncaughtException(err);
        getCallback(Worker.prototype.stop)();
        sinon.assert.calledOnce(ctx.worker.waitForCleanExit);
        done();
      });
    });

    describe('handleStopSignal', function () {
      beforeEach(function (done) {
        sinon.stub(Worker.prototype, 'stop');
        sinon.stub(Worker.prototype, 'waitForCleanExit');
        sinon.stub(process, 'exit');
        process.exit.restore();
        done();
      });
      afterEach(function (done) {
        Worker.prototype.stop.restore();
        Worker.prototype.waitForCleanExit.restore();
        done();
      });

      it('it should log the error and stop the worker', function (done) {
        ctx.worker.handleStopSignal();
        getCallback(Worker.prototype.stop)();
        sinon.assert.calledOnce(ctx.worker.waitForCleanExit);
        done();
      });
    });
  });
});