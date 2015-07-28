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

describe('Master', function () {
  var ctx;
  beforeEach(function (done) {
    ctx = {};
    done();
  });
  beforeEach(function (done) {
    sinon.stub(Master.prototype, 'forkWorkers');
    sinon.stub(Master.prototype, 'cycleWorkers');
    done();
  });
  afterEach(function (done) {
    Master.prototype.forkWorkers.restore();
    Master.prototype.cycleWorkers.restore();
    done();
  });

  describe('constructor', function () {
    afterEach(function (done) {
      process.removeAllListeners('uncaughtException');
      cluster.removeAllListeners('fork');
      cluster.removeAllListeners('online');
      cluster.removeAllListeners('listening');
      cluster.removeAllListeners('exit');
      cluster.removeAllListeners('disconnect');
      done();
    });

    it('should create master process and workers', function (done) {
      ctx.master = new Master();
      sinon.assert.calledOnce(Master.prototype.forkWorkers);
      sinon.assert.calledOnce(Master.prototype.cycleWorkers);
      done();
    });
  });

  describe('instance methods', function () {
    beforeEach(function (done) {
      ctx.master = new Master();
      done();
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
        Master.prototype.forkWorkers.restore();
        master.forkWorkers();
        sinon.stub(Master.prototype, 'forkWorkers');
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
          ctx.setTimeout = setTimeout;
          setTimeout = sinon.stub().returns({ id: 400 });
          ctx.setInterval = setInterval;
          setInterval = sinon.stub().returns({ id: 500 });
          process.env.ENABLE_CLUSTERING = true;
          process.env.WORKER_LIFE_INTERVAL = 20;
          done();
        });
        afterEach(function (done) {
          setTimeout = ctx.setTimeout;
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

        describe('ENABLE_CLUSTERING = false', function() {
          beforeEach(function (done) {
            process.env.ENABLE_CLUSTERING = false;
            process.env.WORKER_LIFE_INTERVAL = 20;
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

    describe('handleWorkerExit', function () {
      beforeEach(function (done) {
        sinon.stub(Master.prototype, 'createWorker');
        ctx.mockWorker = { id: 1 };
        ctx.master.workers = [ctx.mockWorker];
        ctx.clearTimeout = clearTimeout;
        clearTimeout = sinon.spy();
        done();
      });
      afterEach(function (done) {
        Master.prototype.createWorker.restore();
        clearTimeout = ctx.clearTimeout;
        done();
      });

      it('should remove the worker from workers and create a new worker', function (done) {
        var mockWorker = ctx.mockWorker;
        ctx.master.handleWorkerExit(mockWorker);
        expect(ctx.master.workers).to.be.empty();
        sinon.assert.calledOnce(Master.prototype.createWorker);
        sinon.assert.calledOnce(clearTimeout);
        done();
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