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
var workerFactory = require('process/worker-factory');
var dogstatsd = require('models/datadog');
var cachedGlobals = {
  setTimeout: setTimeout,
  setInterval: setInterval,
  clearTimeout: clearTimeout,
  clearInterval: clearInterval
};
var stubGlobal = function (name) {
  if (global[name] !== cachedGlobals[name]) {
    throw new Error(name+' already stubbed');
  }
  var stub = global[name] = sinon.stub();
  return stub;
};
var restoreGlobal = function (name) {
  global[name] = cachedGlobals[name];
};

describe('Master', function () {
  var ctx;
  beforeEach(function (done) {
    ctx = {};
    done();
  });
  beforeEach(function (done) {
    sinon.stub(Master.prototype, 'forkWorkers');
    sinon.stub(Master.prototype, 'cycleWorkers');
    sinon.stub(Master.prototype, 'monitorWorkers');
    done();
  });
  afterEach(function (done) {
    Master.prototype.forkWorkers.restore();
    Master.prototype.cycleWorkers.restore();
    Master.prototype.monitorWorkers.restore();
    done();
  });

  describe('constructor', function () {
    afterEach(function (done) {
      process.removeAllListeners('uncaughtException');
      cluster.removeAllListeners('fork');
      cluster.removeAllListeners('online');
      cluster.removeAllListeners('exit');
      cluster.removeAllListeners('disconnect');
      done();
    });

    it('should create master process and workers', function (done) {
      ctx.master = new Master();
      sinon.assert.calledOnce(Master.prototype.forkWorkers);
      sinon.assert.calledOnce(Master.prototype.cycleWorkers);
      sinon.assert.calledOnce(Master.prototype.monitorWorkers);
      done();
    });
  });

  describe('instance methods', function () {
    beforeEach(function (done) {
      ctx.master = new Master();
      done();
    });

    describe('monitorWorkers', function() {
      beforeEach(function (done) {
        Master.prototype.monitorWorkers.restore(); // unmock for this test
        // stub setInterval
        ctx.setInterval = setInterval;
        setInterval = sinon.stub();
        done();
      });
      afterEach(function (done) {
        // restore setInterval
        setInterval = ctx.setInterval;
        done();
      });

      it('should setInterval to reportWorkerCount', function(done) {
        ctx.master.monitorWorkers();
        sinon.stub(Master.prototype, 'monitorWorkers'); // remock
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
        Master.prototype.forkWorkers.restore(); // unstub for this test
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
        sinon.stub(Master.prototype, 'forkWorkers'); // restub
        sinon.assert.callCount(master.createWorker, master.numWorkers);
        done();
      });
    });

    describe('createWorker', function () {
      beforeEach(function (done) {
        ctx.mockWorker = {};
        sinon.stub(workerFactory, 'create').returns(ctx.mockWorker);
        done();
      });
      afterEach(function (done) {
        workerFactory.create.restore();
        done();
      });

      it('should call create worker and push it to workers', function (done) {
        ctx.master.createWorker();
        sinon.assert.calledOnce(workerFactory.create);
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
        ctx.mockTimer = {};
        stubGlobal('setTimeout').returns(ctx.mockTimer);
        done();
      });
      afterEach(function (done) {
        Master.prototype.removeWorker.restore();
        restoreGlobal('setTimeout');
        done();
      });

      it('should move worker to dyingWorkers, kill it, and set kill timer', function(done) {
        ctx.master.killWorker(ctx.mockWorker);
        expect(ctx.master.dyingWorkers['1']).to.equal(ctx.mockWorker);
        sinon.assert.calledOnce(setTimeout);
        sinon.assert.calledWith(setTimeout, sinon.match.func, process.env.WORKER_KILL_TIMEOUT);
        sinon.assert.calledOnce(ctx.mockWorker.process.kill);
        sinon.assert.calledWith(ctx.mockWorker.process.kill, 1);
        expect(ctx.mockWorker.killTimer).to.equal(ctx.mockTimer);
        done();
      });

      describe('w/ signal', function() {
        it('should move worker to dyingWorkers, kill it, and set kill timer', function(done) {
          ctx.master.killWorker(ctx.mockWorker, 'SIGINT');
          expect(ctx.master.dyingWorkers['1']).to.equal(ctx.mockWorker);
          sinon.assert.calledOnce(setTimeout);
          sinon.assert.calledWith(setTimeout, sinon.match.func, process.env.WORKER_KILL_TIMEOUT);
          sinon.assert.calledOnce(ctx.mockWorker.process.kill);
          sinon.assert.calledWith(ctx.mockWorker.process.kill, 'SIGINT');
          expect(ctx.mockWorker.killTimer).to.equal(ctx.mockTimer);
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
          Master.prototype.cycleWorkers.restore();
          var interval = ctx.master.cycleWorkers();
          expect(interval).to.be.an.object();
          sinon.stub(Master.prototype, 'cycleWorkers');
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
            Master.prototype.cycleWorkers.restore();
            var ret = ctx.master.cycleWorkers();
            sinon.stub(Master.prototype, 'cycleWorkers');
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
          }
        };
        ctx.master.workers = [ctx.mockWorker];
        sinon.stub(Master.prototype, 'logWorkerEvent');
        sinon.stub(Master.prototype, 'createWorker');
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
        sinon.assert.calledOnce(Master.prototype.killWorker);
        sinon.assert.calledWith(Master.prototype.killWorker, ctx.mockWorker);
        expect(ctx.mockWorker.dontCreateReplacement).to.be.true();
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
        ctx.mockWorker = { id: 1, killTimer: {} };
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
        sinon.assert.calledOnce(clearTimeout);
        sinon.assert.calledWith(clearTimeout, ctx.mockWorker.killTimer);
        sinon.assert.calledOnce(Master.prototype.createWorker);
        done();
      });

      describe('worker w/out killTimer', function() {
        beforeEach(function (done) {
          delete ctx.mockWorker.killTimer;
          done();
        });

        it('should not call createWorker', function(done) {
          sinon.assert.notCalled(clearTimeout);
          done();
        });
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
          sinon.assert.calledOnce(clearTimeout);
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

    describe('handleWorkerKillTimeout', function() {
      beforeEach(function (done) {
        ctx.mockWorker = {
          id: 1,
          process: {
            kill: sinon.stub()
          }
        };
        sinon.stub(Master.prototype, 'logWorkerEvent');
        done();
      });
      afterEach(function (done) {
        Master.prototype.logWorkerEvent.restore();
        done();
      });

      it('it should log and hard kill the process', function (done) {
        ctx.master.handleWorkerKillTimeout(ctx.mockWorker);
        sinon.assert.calledOnce(Master.prototype.logWorkerEvent);
        sinon.assert.calledWith(
          Master.prototype.logWorkerEvent,
          sinon.match(/kill timed out/),
          ctx.mockWorker
        );
        sinon.assert.calledOnce(ctx.mockWorker.process.kill);
        sinon.assert.calledWith(ctx.mockWorker.process.kill, 1);
        done();
      });
    });
  });

});