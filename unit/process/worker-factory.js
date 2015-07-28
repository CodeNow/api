'use strict';

var cluster = require('cluster');
var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var beforeEach = lab.beforeEach;
var afterEach = lab.afterEach;

var cluster = require('cluster');
var Bunyan = require('bunyan');
var sinon = require('sinon');
var workerFactory = require('process/worker-factory');

describe('Worker Factory', function () {
  var ctx;
  beforeEach(function (done) {
    ctx = {};
    done();
  });

  describe('create', function() {
    beforeEach(function (done) {
      ctx.mockWorker = {
        id: 1,
        process: {
          on: sinon.stub()
        }
      };
      sinon.stub(cluster, 'fork').returns(ctx.mockWorker);
      sinon.stub(Bunyan.prototype, 'info');
      done();
    });
    afterEach(function (done) {
      cluster.fork.restore();
      Bunyan.prototype.info.restore();
      done();
    });

    it('should fork the process and listen to uncaughtExceptions', function (done) {
      workerFactory.create();
      sinon.assert.calledOnce(ctx.mockWorker.process.on);
      sinon.assert.calledWith(ctx.mockWorker.process.on, 'uncaughtException');
      sinon.assert.calledWith(Bunyan.prototype.info, sinon.match(/create new worker/), ctx.mockWorker.id);
      done();
    });
  });
});