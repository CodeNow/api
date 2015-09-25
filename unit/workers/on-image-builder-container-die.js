/**
 * @module unit/workers/on-image-builder-container-die
 */
'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();

var Code = require('code');
var async = require('async');
var noop = require('101/noop');
var sinon = require('sinon');

var ContextVersion = require('models/mongo/context-version');
var Docker = require('models/apis/docker');
var Sauron = require('models/apis/sauron.js');

var OnImageBuilderContainerDie = require('workers/on-image-builder-container-die');

var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;

var path = require('path');
var moduleName = path.relative(process.cwd(), __filename);

describe('OnImageBuilderContainerDie: '+moduleName, function () {
  var ctx;

  beforeEach(function (done) {
    ctx = {};
    ctx.data = {
      from: '34565762',
      host: '5476',
      id: '3225',
      time: '234234',
      uuid: '12343',
      dockerHost: '0.0.0.0'
    };
    ctx.mockContextVersion = {
      toJSON: noop
    };
    sinon.stub(async, 'series', noop);
    ctx.worker = new OnImageBuilderContainerDie(ctx.data);
    ctx.worker.handle();
    done();
  });

  afterEach(function (done) {
    async.series.restore();
    done();
  });

  describe('_finalSeriesHandler', function () {
    it('TODO', function (done) {
      done();
    });
  });

  describe('_getBuildInfo', function () {
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(Docker.prototype, 'getBuildInfo', function (containerId, cb) {
          cb(null, {});
        });
        sinon.stub(ctx.worker, '_handleBuildError', function (data, cb) {
          expect(data).to.be.an.object();
          cb();
        });
        sinon.stub(ctx.worker, '_handleBuildComplete', function (data, cb) {
          expect(data).to.be.an.object();
          cb();
        });
        done();
      });
      afterEach(function (done) {
        Docker.prototype.getBuildInfo.restore();
        ctx.worker._handleBuildError.restore();
        ctx.worker._handleBuildComplete.restore();
        done();
      });
      it('should fetch build info and update success', function (done) {
        ctx.worker._getBuildInfo(function (err) {
          expect(err).to.be.undefined();
          expect(ctx.worker._handleBuildComplete.callCount).to.equal(1);
          expect(ctx.worker._handleBuildError.callCount).to.equal(0);
          done();
        });
      });
    });
    describe('build failure', function () {
      beforeEach(function (done) {
        sinon.stub(Docker.prototype, 'getBuildInfo', function (containerId, cb) {
          cb(null, {
            failed: true
          });
        });
        sinon.stub(ctx.worker, '_handleBuildError', function (data, cb) {
          expect(data).to.be.an.object();
          cb();
        });
        sinon.stub(ctx.worker, '_handleBuildComplete', function (data, cb) {
          expect(data).to.be.an.object();
          cb();
        });
        done();
      });
      afterEach(function (done) {
        Docker.prototype.getBuildInfo.restore();
        ctx.worker._handleBuildError.restore();
        ctx.worker._handleBuildComplete.restore();
        done();
      });
      it('should fetch build info and update build failure', function (done) {
        ctx.worker._getBuildInfo(function (err) {
          expect(err).to.be.undefined();
          expect(ctx.worker._handleBuildComplete.callCount).to.equal(1);
          expect(ctx.worker._handleBuildError.callCount).to.equal(0);
          done();
        });
      });
    });
    describe('fetch failure', function () {
      beforeEach(function (done) {
        sinon.stub(Docker.prototype, 'getBuildInfo', function (containerId, cb) {
          cb(new Error('docker error'));
        });
        sinon.stub(ctx.worker, '_handleBuildError', function (data, cb) {
          expect(data).to.be.an.object();
          cb();
        });
        sinon.stub(ctx.worker, '_handleBuildComplete', function (data, cb) {
          expect(data).to.be.an.object();
          cb();
        });
        done();
      });
      afterEach(function (done) {
        Docker.prototype.getBuildInfo.restore();
        ctx.worker._handleBuildError.restore();
        ctx.worker._handleBuildComplete.restore();
        done();
      });
      it('should fetch build info and update fetch failure', function (done) {
        ctx.worker._getBuildInfo(function (err) {
          expect(err).to.be.undefined();
          expect(ctx.worker._handleBuildComplete.callCount).to.equal(0);
          expect(ctx.worker._handleBuildError.callCount).to.equal(1);
          done();
        });
      });
    });
  });

  describe('_handleBuildError', function () {
    beforeEach(function (done) {
      sinon.stub(ContextVersion, 'updateBuildErrorByContainer',
                 function (containerId, err, cb) {
        expect(containerId).to.equal(ctx.data.id);
        cb();
      });
      done();
    });
    afterEach(function (done) {
      ContextVersion.updateBuildErrorByContainer.restore();
      done();
    });
    it('it should handle errored build', function (done) {
      ctx.worker._handleBuildError({}, function () {
        expect(ContextVersion.updateBuildErrorByContainer.callCount).to.equal(1);
        done();
      });
    });
  });

  describe('_handleBuildComplete', function () {
    beforeEach(function (done) {
      ctx.buildInfo = {};
      sinon.stub(ContextVersion, 'updateBuildCompletedByContainer',
                 function (containerId, buildInfo, cb) {
        expect(containerId).to.equal(ctx.data.id);
        expect(buildInfo).to.equal(ctx.buildInfo);
        cb();
      });
      done();
    });
    afterEach(function (done) {
      ContextVersion.updateBuildCompletedByContainer.restore();
      done();
    });
    it('it should handle errored build', function (done) {
      ctx.worker._handleBuildComplete(ctx.buildInfo, function () {
        expect(ContextVersion.updateBuildCompletedByContainer.callCount).to.equal(1);
        done();
      });
    });
  });

  describe('_deallocImageBuilderNetwork', function () {
    beforeEach(function (done) {
      sinon.stub(Sauron, 'deleteHostFromContextVersion', function (cv, cb) {
        expect(cv).to.equal(ctx.worker.contextVersion);
        cb();
      });
      done();
    });
    afterEach(function (done) {
      Sauron.deleteHostFromContextVersion.restore();
      done();
    });
    it('should delete host from context version', function (done) {
      ctx.worker._deallocImageBuilderNetwork(function () {
        expect(Sauron.deleteHostFromContextVersion.callCount).to.equal(1);
        done();
      });
    });
  });
});
