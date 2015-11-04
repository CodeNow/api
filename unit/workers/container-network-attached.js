/**
 * @module unit/workers/container-network-attached
 */
'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();

var Code = require('code');
var sinon = require('sinon');

var ContainerNetworkAttached = require('workers/container-network-attached');
var InstanceService = require('models/services/instance-service');

var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;

var path = require('path');
var moduleName = path.relative(process.cwd(), __filename);

describe('ContainerNetworkAttached: '+moduleName, function () {
  var ctx;

  beforeEach(function (done) {
    ctx = {};
    ctx.mockInstance = {
      '_id': 'adsfasdfasdfqwfqw cvasdvasDFV',
      name: 'name1',
      owner: {
        github: '',
        username: 'foo',
        gravatar: ''
      },
      createdBy: {
        github: '',
        username: '',
        gravatar: ''
      },
      network: {
        hostIp: '0.0.0.0'
      },
      modifyContainerInspect: function () {}
    };
    ctx.labels = {
      instanceId: ctx.mockInstance._id,
      ownerUsername: 'fifo',
      sessionUserGithubId: 444,
      contextVersionId: 123
    };
    ctx.data = {
      containerId: 'container-id-1',
      containerIp: '192.16.17.01'
    };
    ctx.worker = new ContainerNetworkAttached(ctx.data);
    done();
  });
  beforeEach(function (done) {
    sinon.stub(ctx.worker, '_baseWorkerFindInstance', function (query, cb) {
      ctx.worker.instance = ctx.mockInstance;
      cb(null, ctx.mockInstance);
    });
    sinon.stub(ctx.worker, '_baseWorkerUpdateInstanceFrontend').yieldsAsync(null);
    done();
  });
  afterEach(function (done) {
    ctx.worker._baseWorkerFindInstance.restore();
    ctx.worker._baseWorkerUpdateInstanceFrontend.restore();
    done();
  });
  describe('all together', function () {

    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(InstanceService.prototype, 'modifyContainerIp')
          .yieldsAsync(null, ctx.mockInstance);
        done();
      });
      afterEach(function (done) {
        InstanceService.prototype.modifyContainerIp.restore();
        done();
      });

      it('should do everything', function (done) {
        ctx.worker.handle(function (err) {
          // This should never return an error
          expect(err).to.be.undefined();
          expect(ctx.worker._baseWorkerFindInstance.callCount).to.equal(1);
          expect(InstanceService.prototype.modifyContainerIp.callCount).to.equal(1);
          var args = InstanceService.prototype.modifyContainerIp.getCall(0).args;
          expect(args[0]).to.equal(ctx.mockInstance);
          expect(args[1]).to.equal(ctx.data.containerId);
          expect(args[2]).to.equal(ctx.data.containerIp);
          expect(ctx.worker._baseWorkerUpdateInstanceFrontend.callCount).to.equal(1);
          var updateFrontendArgs = ctx.worker._baseWorkerUpdateInstanceFrontend.getCall(0).args;
          expect(updateFrontendArgs[0]).to.equal(ctx.mockInstance._id);
          expect(updateFrontendArgs[1]).to.equal(ctx.mockInstance.createdBy.github);
          expect(updateFrontendArgs[2]).to.equal('update');
          done();
        });
      });
    });
    describe('failure', function () {
      beforeEach(function (done) {
        sinon.stub(InstanceService.prototype, 'modifyContainerIp')
          .yieldsAsync(new Error('this is an error'));
        done();
      });

      afterEach(function (done) {
        InstanceService.prototype.modifyContainerIp.restore();
        done();
      });

      it('should get most of the way through, then fail', function (done) {
        ctx.worker.handle(function (err) {
          // This should never return an error
          expect(err).to.be.undefined();
          expect(ctx.worker._baseWorkerFindInstance.callCount).to.equal(1);
          expect(InstanceService.prototype.modifyContainerIp.callCount).to.equal(1);
          expect(ctx.worker._baseWorkerUpdateInstanceFrontend.callCount).to.equal(0);
          done();
        });
      });
    });
  });

  describe('_updateInstance', function () {
    beforeEach(function (done) {
      // normally set by _baseWorkerFindInstance
      ctx.worker.instance = ctx.mockInstance;
      done();
    });
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(InstanceService.prototype, 'modifyContainerIp')
          .yieldsAsync(null, ctx.mockInstance);
        done();
      });

      afterEach(function (done) {
        InstanceService.prototype.modifyContainerIp.restore();
        done();
      });

      it('should find and update instance with container', function (done) {
        ctx.worker._updateInstance(function (err) {
          expect(err).to.be.null();
          expect(InstanceService.prototype.modifyContainerIp.callCount).to.equal(1);
          var args = InstanceService.prototype.modifyContainerIp.getCall(0).args;
          expect(args[0]).to.equal(ctx.mockInstance);
          expect(args[1]).to.equal(ctx.data.containerId);
          expect(args[2]).to.equal(ctx.data.containerIp);
          done();
        });
      });
    });
    describe('failure', function () {
      beforeEach(function (done) {
        sinon.stub(InstanceService.prototype, 'modifyContainerIp')
          .yieldsAsync(new Error('this is an error'));
        done();
      });

      afterEach(function (done) {
        InstanceService.prototype.modifyContainerIp.restore();
        done();
      });

      it('should find and update instance with container', function (done) {
        ctx.worker._updateInstance(function (err) {
          expect(err.message).to.equal('this is an error');
          expect(InstanceService.prototype.modifyContainerIp.callCount).to.equal(1);
          done();
        });
      });
    });
  });
});
