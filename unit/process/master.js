'use strict';

var cluster = require('cluster');
var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var beforeEach = lab.beforeEach;
var afterEach = lab.afterEach;
var expect = require('code').expect;

var Bunyan = require('bunyan');
var sinon = require('sinon');
var Master = require('process/master');
var dogstatsd = require('models/datadog');
var stubGlobal = require('../fixtures/stub-global');
var restoreGlobal = require('../fixtures/restore-global');

describe('Master', function () {
  var ctx;
  beforeEach(function (done) {
    ctx = {};
    done();
  });

  describe('constructor', function () {
    it('should create master process and workers', function (done) {
      var master = ctx.master = new Master();
      expect(master.workers)
        .to.be.an.array()
        .to.be.empty();
      expect(master.dyingWorkers)
        .to.be.an.object()
        .to.be.empty();
      expect(master.numWorkers)
        .to.be.a.number();
      done();
    });
  });

  describe('instance methods', function () {
    beforeEach(function (done) {
      ctx.master = new Master();
      done();
    });

    describe('start', function () {
      beforeEach(function (done) {
        sinon.stub(Master.prototype, 'listenToProcessEvents');
        sinon.stub(Master.prototype, 'listenToSignals');
        sinon.stub(Master.prototype, 'forkWorkers');
        ctx.cycleInt = {};
        ctx.monitorInt = {};
        sinon.stub(Master.prototype, 'cycleWorkers').returns(ctx.cycleInt);
        sinon.stub(Master.prototype, 'monitorWorkers').returns(ctx.monitorInt);
        done();
      });
      afterEach(function (done) {
        Master.prototype.listenToProcessEvents.restore();
        Master.prototype.listenToSignals.restore();
        Master.prototype.forkWorkers.restore();
        Master.prototype.cycleWorkers.restore();
        Master.prototype.monitorWorkers.restore();
        done();
      });

      it('should start workers', function (done) {
        ctx.master.start(function (err) {
          if (err) { return done(err); }
          sinon.assert.calledOnce(Master.prototype.listenToProcessEvents);
          sinon.assert.calledOnce(Master.prototype.listenToSignals);
          sinon.assert.calledOnce(Master.prototype.forkWorkers);
          sinon.assert.calledOnce(Master.prototype.cycleWorkers);
          sinon.assert.calledOnce(Master.prototype.monitorWorkers);
          expect(ctx.master.cycleInterval).to.equal(ctx.cycleInt);
          expect(ctx.master.monitorInterval).to.equal(ctx.monitorInt);
          done();
        });
      });
    });

    describe('stop', function () {
      beforeEach(function (done) {
        sinon.stub(cluster, 'on');
        sinon.stub(Master.prototype, 'killWorker');
        sinon.stub(cluster, 'removeAllListeners');
        sinon.stub(process, 'removeAllListeners');
        ctx.master.cycleInterval = {};
        ctx.master.monitorInterval = {};
        ctx.mockWorker = { id: 1 };
        ctx.master.workers = [ ctx.mockWorker ];
        stubGlobal('clearInterval');
        done();
      });
      afterEach(function (done) {
        cluster.on.restore();
        Master.prototype.killWorker.restore();
        cluster.removeAllListeners.restore();
        process.removeAllListeners.restore();
        restoreGlobal('clearInterval');
        done();
      });

      it('should stop all the workers and intervals', function (done) {
        ctx.master.stop(stoppedAssertions);
        sinon.assert.calledWith(clearInterval, ctx.master.cycleInterval);
        sinon.assert.calledWith(clearInterval, ctx.master.monitorInterval);
        sinon.assert.calledWith(cluster.on, 'exit', sinon.match.func);
        expect(ctx.mockWorker.dontCreateReplacement).to.be.true();
        sinon.assert.calledWith(Master.prototype.killWorker, ctx.mockWorker);
        process.nextTick(function () { // mock worker exit
          var handleWorkerExit = cluster.on.firstCall.args[1];
          handleWorkerExit(ctx.mockWorker);
        });
        function stoppedAssertions (err) {
          if (err) { return done(err); }
          sinon.assert.calledWith(process.removeAllListeners, 'uncaughtException');
          sinon.assert.calledWith(process.removeAllListeners, 'SIGINT');
          sinon.assert.calledWith(process.removeAllListeners, 'SIGTERM');
          sinon.assert.calledWith(cluster.removeAllListeners, 'fork');
          sinon.assert.calledWith(cluster.removeAllListeners, 'online');
          sinon.assert.calledWith(cluster.removeAllListeners, 'exit');
          sinon.assert.calledWith(cluster.removeAllListeners, 'disconnect');
          done();
        }
      });
    });

    describe('monitorWorkers', function() {
      beforeEach(function (done) {
        stubGlobal('setInterval');
        done();
      });
      afterEach(function (done) {
        restoreGlobal('setInterval');
        done();
      });

      it('should setInterval to reportWorkerCount', function(done) {
        ctx.master.monitorWorkers();
        sinon.assert.calledOnce(setInterval);
        sinon.assert.calledWith(setInterval, sinon.match.func, process.env.MONITOR_INTERVAL);
        done();
      });
    });

    describe('reportWorkerCount', function() {
      beforeEach(function (done) {
        sinon.stub(dogstatsd, 'gauge');
        done();
      });
      afterEach(function (done) {
        dogstatsd.gauge.restore();
        done();
      });

      it('should report worker counts to dogstatsd', function(done) {
        ctx.master.reportWorkerCount();
        sinon.assert.calledTwice(dogstatsd.gauge);
        sinon.assert.calledWith(dogstatsd.gauge, 'api.worker_count', 0, 1);
        sinon.assert.calledWith(dogstatsd.gauge, 'api.dying_worker_count', 0, 1);
        done();
      });
    });

    describe('logWorkerEvent', function () {
      beforeEach(function (done) {
        sinon.stub(Bunyan.prototype, 'info');
        done();
      });
      afterEach(function (done) {
        Bunyan.prototype.info.restore();
        done();
      });

      it('should log.info', function (done) {
        var mockWorker = {
          id: 1
        };
        ctx.master.logWorkerEvent('fork', mockWorker);
        sinon.assert.calledOnce(Bunyan.prototype.info);
        sinon.assert.calledWith(Bunyan.prototype.info, {worker:1}, sinon.match(/worker fork/));
        done();
      });
    });

    describe('forkWorkers', function () {
      beforeEach(function (done) {
        sinon.stub(Master.prototype, 'createWorker');
        done();
      });
      afterEach(function (done) {
        Master.prototype.createWorker.restore();
        done();
      });

      it('should call createWorker "numWorker" times', function (done) {
        var master = ctx.master;
        master.forkWorkers();
        sinon.assert.callCount(master.createWorker, master.numWorkers);
        done();
      });
    });

    describe('createWorker', function () {
      beforeEach(function (done) {
        ctx.mockWorker = {};
        sinon.stub(cluster, 'fork').returns(ctx.mockWorker);
        done();
      });
      afterEach(function (done) {
        cluster.fork.restore();
        done();
      });

      it('should call create worker and push it to workers', function (done) {
        ctx.master.createWorker();
        sinon.assert.calledOnce(cluster.fork);
        expect(ctx.master.workers.length).to.equal(1);
        expect(ctx.master.workers[0]).to.equal(ctx.mockWorker);
        done();
      });
    });

    describe('killWorker', function() {
      beforeEach(function (done) {
        ctx.mockWorker = {
          id: 1,
          process: {
            kill: sinon.stub()
          }
        };
        ctx.master.workers = [ctx.mockWorker];
        sinon.stub(Master.prototype, 'removeWorker');
        done();
      });
      afterEach(function (done) {
        Master.prototype.removeWorker.restore();
        done();
      });

      it('should move worker to dyingWorkers, kill it, and set kill timer', function(done) {
        ctx.master.killWorker(ctx.mockWorker, 'SIGINT');
        expect(ctx.master.dyingWorkers[ctx.mockWorker.id]).to.equal(ctx.mockWorker);
        sinon.assert.calledOnce(ctx.mockWorker.process.kill);
        sinon.assert.calledWith(ctx.mockWorker.process.kill, 'SIGINT');
        done();
      });

      describe('w/ signal', function() {
        it('should move worker to dyingWorkers, kill it, and set kill timer', function(done) {
          ctx.master.killWorker(ctx.mockWorker, 'SIGKILL');
          expect(ctx.master.dyingWorkers['1']).to.equal(ctx.mockWorker);
          sinon.assert.calledOnce(ctx.mockWorker.process.kill);
          sinon.assert.calledWith(ctx.mockWorker.process.kill, 'SIGKILL');
          done();
        });
      });
    });

    describe('removeWorker', function() {
      beforeEach(function (done) {
        ctx.mockWorker = {id:1};
        ctx.master.workers = [ctx.mockWorker];
        done();
      });

      it('should remove the worker from `workers`', function(done) {
        ctx.master.removeWorker(ctx.mockWorker);
        expect(ctx.master.workers).to.be.empty();
        done();
      });
    });

    describe('cycleWorkers', function () {
      beforeEach(function (done) {
        ctx.ENABLE_CLUSTERING = process.env.ENABLE_CLUSTERING;
        ctx.WORKER_LIFE_INTERVAL = process.env.WORKER_LIFE_INTERVAL;
        process.env.ENABLE_CLUSTERING = true;
        process.env.WORKER_LIFE_INTERVAL = 20;
        sinon.stub(Bunyan.prototype, 'info');
        done();
      });
      afterEach(function (done) {
        process.env.ENABLE_CLUSTERING = ctx.ENABLE_CLUSTERING;
        process.env.WORKER_LIFE_INTERVAL = ctx.WORKER_LIFE_INTERVAL;
        Bunyan.prototype.info.restore();
        done();
      });

      describe('enabled', function () {
        beforeEach(function (done) {
          ctx.setInterval = setInterval;
          setInterval = sinon.stub().returns({ id: 500 });
          process.env.ENABLE_CLUSTERING = true;
          process.env.WORKER_LIFE_INTERVAL = 20;
          done();
        });
        afterEach(function (done) {
          setInterval = ctx.setInterval;
          done();
        });

        it('should setInterval and start killing workers', function (done) {
          var mockWorker = { id: 1 };
          ctx.master.workers = [mockWorker];
          // unmock cycleWorkers and invoke it
          var interval = ctx.master.cycleWorkers();
          expect(interval).to.be.an.object();
          sinon.assert.calledOnce(setInterval);
          sinon.assert.calledWith(setInterval, sinon.match.func, process.env.WORKER_LIFE_INTERVAL);
          done();
        });
      });

      describe('disabled', function() {

        describe('WORKER_LIFE_INTERVAL is undefined', function() {
          beforeEach(function (done) {
            process.env.ENABLE_CLUSTERING = true;
            delete process.env.WORKER_LIFE_INTERVAL;
            done();
          });

          it('should do nothing', function(done) {
            // unmock cycleWorkers and invoke it
            var ret = ctx.master.cycleWorkers();
            expect(ret).to.be.false();
            done();
          });
        });
      });
    });

    describe('softKillOldestWorker', function() {
      beforeEach(function (done) {
        ctx.mockWorker = {
          id: 1,
          process: {
            kill: sinon.stub()
          },
          once: sinon.stub()
        };
        ctx.master.workers = [ctx.mockWorker];
        sinon.stub(Master.prototype, 'logWorkerEvent');
        sinon.stub(Master.prototype, 'createWorker').returns(ctx.mockWorker);
        sinon.stub(Master.prototype, 'killWorker');
        done();
      });
      afterEach(function (done) {
        Master.prototype.logWorkerEvent.restore();
        Master.prototype.createWorker.restore();
        Master.prototype.killWorker.restore();
        done();
      });

      it('should stop oldest worker', function (done) {
        ctx.master.softKillOldestWorker();
        sinon.assert.calledOnce(Master.prototype.logWorkerEvent);
        sinon.assert.calledWith(
          Master.prototype.logWorkerEvent,
          sinon.match(/kill by interval/),
          ctx.mockWorker
        );
        sinon.assert.calledOnce(Master.prototype.createWorker);
        var handleOnline = ctx.mockWorker.once.firstCall.args[1];
        handleOnline(ctx.mockWorker);
        expect(ctx.mockWorker.dontCreateReplacement).to.be.true();
        sinon.assert.calledWith(Master.prototype.killWorker, ctx.mockWorker, 'SIGINT');
        done();
      });

      describe('no workers', function() {
        beforeEach(function (done) {
          ctx.master.workers = [];
          done();
        });

        it('should do nothing', function(done) {
          sinon.assert.notCalled(Master.prototype.logWorkerEvent);
          done();
        });
      });
    });

    describe('handleWorkerExit', function () {
      beforeEach(function (done) {
        ctx.mockWorker = { id: 1 };
        ctx.master.dyingWorkers[ctx.mockWorker.id] = ctx.mockWorker;
        sinon.stub(Master.prototype, 'logWorkerEvent');
        sinon.stub(Master.prototype, 'createWorker');
        stubGlobal('clearTimeout');
        done();
      });
      afterEach(function (done) {
        Master.prototype.logWorkerEvent.restore();
        Master.prototype.createWorker.restore();
        restoreGlobal('clearTimeout');
        done();
      });

      it('should remove the worker from workers and create a new worker', function (done) {
        ctx.master.handleWorkerExit(ctx.mockWorker);
        expect(ctx.master.dyingWorkers[ctx.mockWorker.id]).to.be.undefined();
        sinon.assert.calledOnce(Master.prototype.createWorker);
        done();
      });

      describe('worker w/ dontCreateReplacement', function() {
        beforeEach(function (done) {
          ctx.mockWorker.dontCreateReplacement = true;
          done();
        });

        it('should not call createWorker', function(done) {
          var mockWorker = ctx.mockWorker;
          ctx.master.handleWorkerExit(mockWorker);
          sinon.assert.notCalled(Master.prototype.createWorker);
          done();
        });
      });
    });

    describe('handleUncaughtException', function() {
      beforeEach(function (done) {
        sinon.stub(Bunyan.prototype, 'fatal');
        done();
      });
      afterEach(function (done) {
        Bunyan.prototype.fatal.restore();
        done();
      });

      it('should log.fatal', function (done) {
        var mockErr = {};
        ctx.master.handleUncaughtException(mockErr);
        sinon.assert.calledOnce(Bunyan.prototype.fatal);
        sinon.assert.calledWith(Bunyan.prototype.fatal, {err:mockErr}, sinon.match(/uncaught exception/));
        done();
      });
    });

  });

});