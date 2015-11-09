/**
 * @module unit/workers/container.network.attach-failed
 */
'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();

var Code = require('code');
var sinon = require('sinon');

var ContainerNetworkAttachFailed = require('workers/container.network.attach-failed');
var Instance = require('models/mongo/instance');

var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;

var path = require('path');
var moduleName = path.relative(process.cwd(), __filename);

describe('ContainerNetworkAttachFailed: '+moduleName, function () {
  var ctx;

  beforeEach(function (done) {
    ctx = {};
    ctx.mockInstance = {
      '_id': '507f1f77bcf86cd799439011',
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
      }
    };
    ctx.data = {
      id: 'container-id-1',
      err: {
        'data': {
          'cmd': '/usr/local/bin/weave attach 533da8aaa7d32cd6861b2248abffb3e78c51cacf1da7c67ccba05f44068acbb9',
          'err': {
            'killed': false,
            'code': 1,
            'signal': null
          }
        },
        'isBoom': true,
        'isServer': true,
        'output': {
          'statusCode': 500,
          'payload': {
            'statusCode': 500,
            'error': 'Internal Server Error',
            'message': 'An internal server error occurred'
          }
        }
      }
    };
    ctx.data.inspectData = {
      Config: {
        Labels: {
          instanceId: ctx.data.instanceId,
          ownerUsername: 'anton',
          sessionUserGithubId: 111987,
          contextVersionId: 'some-cv-id'
        }
      }
    };
    ctx.worker = new ContainerNetworkAttachFailed(ctx.data);
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
        sinon.stub(Instance, 'findByIdAndUpdate')
          .yieldsAsync(null, ctx.mockInstance);
        done();
      });
      afterEach(function (done) {
        Instance.findByIdAndUpdate.restore();
        done();
      });

      it('should do everything', function (done) {
        ctx.worker.handle(function (err) {
          // This should never return an error
          expect(err).to.be.undefined();
          expect(ctx.worker._baseWorkerFindInstance.callCount).to.equal(1);
          var queryArg = ctx.worker._baseWorkerFindInstance.getCall(0).args[0];
          expect(queryArg._id).to.equal(ctx.data.instanceId);
          expect(queryArg['container.dockerContainer']).to.equal(ctx.data.id);
          expect(Instance.findByIdAndUpdate.callCount).to.equal(1);
          var args = Instance.findByIdAndUpdate.getCall(0).args;
          expect(args[0]).to.equal(ctx.mockInstance._id);

          var setData = args[1].$set;
          expect(setData.container.error.message).to.equal('An internal server error occurred');
          expect(setData.container.error.data).to.exist();
          expect(setData.container.error.stack).to.exist();
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
        sinon.stub(Instance, 'findByIdAndUpdate')
          .yieldsAsync(new Error('this is an error'));
        done();
      });

      afterEach(function (done) {
        Instance.findByIdAndUpdate.restore();
        done();
      });

      it('should get most of the way through, then fail', function (done) {
        ctx.worker.handle(function (err) {
          // This should never return an error
          expect(err).to.be.undefined();
          expect(ctx.worker._baseWorkerFindInstance.callCount).to.equal(1);
          expect(Instance.findByIdAndUpdate.callCount).to.equal(1);
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
        sinon.stub(Instance, 'findByIdAndUpdate')
          .yieldsAsync(null, ctx.mockInstance);
        done();
      });

      afterEach(function (done) {
        Instance.findByIdAndUpdate.restore();
        done();
      });

      it('should find and update instance with container', function (done) {
        ctx.worker._updateInstance(function (err) {
          expect(err).to.be.null();
          expect(Instance.findByIdAndUpdate.callCount).to.equal(1);
          var args = Instance.findByIdAndUpdate.getCall(0).args;
          expect(args[0]).to.equal(ctx.mockInstance._id);
          var setData = args[1].$set;
          expect(setData.container.error.message).to.equal('An internal server error occurred');
          expect(setData.container.error.data).to.exist();
          expect(setData.container.error.stack).to.exist();
          done();
        });
      });
    });
    describe('failure', function () {
      beforeEach(function (done) {
        sinon.stub(Instance, 'findByIdAndUpdate')
          .yieldsAsync(new Error('this is an error'));
        done();
      });

      afterEach(function (done) {
        Instance.findByIdAndUpdate.restore();
        done();
      });

      it('should find and update instance with container', function (done) {
        ctx.worker._updateInstance(function (err) {
          expect(err.message).to.equal('this is an error');
          expect(Instance.findByIdAndUpdate.callCount).to.equal(1);
          done();
        });
      });
    });
  });
});
