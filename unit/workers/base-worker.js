/**
 * @module unit/workers/base-worker
 */
'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();

var Code = require('code');
var domain = require('domain');
var noop = require('101/noop');
var sinon = require('sinon');

var BaseWorker = require('workers/base-worker');
var ContextVersion = require('models/mongo/context-version');
var Docker = require('models/apis/docker');
var Instance = require('models/mongo/instance');
var User = require('models/mongo/user');
var messenger = require('socket/messenger');

var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;

describe('BaseWorker', function () {
  var ctx;

  beforeEach(function (done) {
    ctx = {};
    ctx.modifyContainerInspectSpy =
      sinon.spy(function (dockerContainerId, inspect, cb) {
      cb(null, ctx.mockContainer);
    });
    ctx.modifyContainerInspectErrSpy = sinon.spy(function (dockerContainerId, error, cb) {
      cb(null);
    });
    ctx.populateModelsSpy = sinon.spy(function (cb) {
      cb(null);
    });
    ctx.populateOwnerAndCreatedBySpy = sinon.spy(function (user, cb) {
      cb(null);
    });
    ctx.data = {
      from: '34565762',
      host: '5476',
      id: '3225',
      time: '234234',
      uuid: '12343'
    };
    ctx.mockUser = {
      _id: 'foo',
      toJSON: noop
    };
    ctx.dockerContainerId = 'asdasdasd';
    ctx.mockContextVersion = {
      toJSON: noop
    };
    ctx.mockContainer = {
      dockerContainer: ctx.data.dockerContainer,
      dockerHost: ctx.data.dockerHost
    };
    ctx.mockInstance = {
      '_id': ctx.data.instanceId,
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
      container: ctx.mockContainer,
      removeStartingStoppingStates: ctx.removeStartingStoppingStatesSpy,
      modifyContainerInspect: ctx.modifyContainerInspectSpy,
      modifyContainerInspectErr: ctx.modifyContainerInspectErrSpy,
      populateModels: ctx.populateModelsSpy,
      populateOwnerAndCreatedBy: ctx.populateOwnerAndCreatedBySpy
    };
    ctx.worker = new BaseWorker(ctx.data);
    done();
  });

  afterEach(function (done) {
    done();
  });

  describe('constructor', function () {
    it('should use uuid from domain.runnableData', function (done) {
      var d = domain.create();
      d.runnableData = {tid: 'foobar'};
      d.run(function () {
        var b = new BaseWorker();
        expect(b.logData.uuid).to.equal('foobar');
        done();
      });
    });
  });

  describe('getRunnableData', function () {
    it('should return an object with a tid', function (done) {
      var runnableData = BaseWorker.getRunnableData();
      expect(runnableData.tid).to.be.a.string();
      done();
    });
  });

  describe('_baseWorkerFindContextVersion', function () {
    describe('basic', function () {
      beforeEach(function (done) {
        sinon.stub(ContextVersion, 'findOne', function (query, cb) {
          cb(null, ctx.mockContextVersion);
        });
        done();
      });
      afterEach(function (done) {
        ContextVersion.findOne.restore();
        done();
      });
      it('should query for contextversion', function (done) {
        ctx.worker._baseWorkerFindContextVersion({}, function (err) {
          expect(err).to.be.null();
          expect(ctx.worker.contextVersion).to.equal(ctx.mockContextVersion);
          done();
        });
      });
    });
  });

  describe('_baseWorkerUpdateInstanceFrontend', function () {

    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.worker, '_baseWorkerFindUser', function (userGithubId, cb) {
          cb(null, ctx.mockUser);
        });
        sinon.stub(ctx.worker, '_baseWorkerFindInstance', function (query, cb) {
          cb(null, ctx.mockInstance);
        });
        sinon.stub(messenger, 'emitInstanceUpdate', function () {});
        done();
      });

      afterEach(function (done) {
        ctx.worker._baseWorkerFindUser.restore();
        ctx.worker._baseWorkerFindInstance.restore();
        messenger.emitInstanceUpdate.restore();
        done();
      });

      it('should fetch instance and notify frontend via primus instance has started',
      function (done) {
        ctx.worker._baseWorkerUpdateInstanceFrontend(
          ctx.data.instanceId,
          ctx.data.sessionUserGithubId,
          'started',
          function () {
            done();
        });
      });
    });
  });

  describe('_baseWorkerUpdateContextVersionFrontend', function () {
    beforeEach(function (done) {
      ctx.worker.contextVersion = ctx.mockContextVersion;
      sinon.stub(messenger, 'emitContextVersionUpdate');
      done();
    });
    afterEach(function (done) {
      messenger.emitContextVersionUpdate.restore();
      ctx.worker._baseWorkerFindContextVersion.restore();
      done();
    });
    describe('basic', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.worker, '_baseWorkerFindContextVersion').yieldsAsync(null, ctx.mockContextVersion);
        done();
      });

      it('should fetch the contextVersion and emit the update', function (done) {
        ctx.worker._baseWorkerUpdateContextVersionFrontend('build_running', function (err) {
          expect(err).to.be.null();
          expect(ctx.worker._baseWorkerFindContextVersion.callCount).to.equal(1);
          expect(ctx.worker._baseWorkerFindContextVersion.args[0][0]).to.deep.equal({
            '_id': ctx.mockContextVersion._id
          });
          expect(ctx.worker._baseWorkerFindContextVersion.args[0][1]).to.be.a.function();
          expect(
            messenger.emitContextVersionUpdate.callCount,
            'emitContextVersionUpdate'
          ).to.equal(1);
          expect(
            messenger.emitContextVersionUpdate.args[0][0],
            'emitContextVersionUpdate arg0'
          ).to.equal(ctx.mockContextVersion);
          expect(
            messenger.emitContextVersionUpdate.args[0][1],
            'emitContextVersionUpdate arg0'
          ).to.equal('build_running');
          done();
        });
      });
    });
    describe('failure', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.worker, '_baseWorkerFindContextVersion').yieldsAsync(new Error('error'));
        done();
      });
      it('should fail with an invalid event message', function (done) {
        ctx.worker._baseWorkerUpdateContextVersionFrontend('dsfasdfasdfgasdf', function (err) {
          expect(err.message).to.equal('Attempted status update contained invalid event');
          done();
        });
      });
      it('should fetch the contextVersion and emit the update', function (done) {
        ctx.worker._baseWorkerUpdateContextVersionFrontend('build_running', function (err) {
          expect(
            messenger.emitContextVersionUpdate.callCount,
            'emitContextVersionUpdate'
          ).to.equal(0);
          expect(err.message).to.equal('error');
          done();
        });
      });
    });
  });

  describe('_baseWorkerValidateDieData', function () {
    beforeEach(function (done) {
      done();
    });
    afterEach(function (done) {
      done();
    });
    it('should call back with error if event '+
       'data does not contain required keys', function (done) {
      delete ctx.worker.data.uuid;
      ctx.worker._baseWorkerValidateDieData(function (err) {
        expect(err.message).to.equal('_baseWorkerValidateDieData: die event data missing key: uuid');
        done();
      });
    });

    it('should call back without error if '+
       'event data contains all required keys', function (done) {
      ctx.worker._baseWorkerValidateDieData(function (err) {
        expect(err).to.be.undefined();
        done();
      });
    });
  });

  describe('_baseWorkerFindInstance', function () {
    describe('basic', function () {
      beforeEach(function (done) {
        sinon.stub(Instance, 'findOne', function (data, cb) {
          cb(null, ctx.mockInstance);
        });
        done();
      });
      afterEach(function (done) {
        Instance.findOne.restore();
        done();
      });
      it('should query mongo for instance w/ container', function (done) {
        ctx.worker._baseWorkerFindInstance({
          _id: ctx.data.instanceId,
          'container.dockerContainer': ctx.data.dockerContainer
        }, function (err) {
          expect(err).to.be.null();
          expect(Instance.findOne.callCount).to.equal(1);
          expect(Instance.findOne.args[0][0]).to.only.contain({
            '_id': ctx.data.instanceId,
            'container.dockerContainer': ctx.data.dockerContainer
          });
          expect(Instance.findOne.args[0][1]).to.be.a.function();
          done();
        });
      });
    });

    describe('found', function () {
      beforeEach(function (done) {
        sinon.stub(Instance, 'findOne', function (data, cb) {
          cb(null, ctx.mockInstance);
        });
        done();
      });
      afterEach(function (done) {
        Instance.findOne.restore();
        done();
      });
      it('should callback successfully if instance w/ container found', function (done) {
        ctx.worker._baseWorkerFindInstance({
          _id: ctx.data.instanceId,
          'container.dockerContainer': ctx.data.dockerContainer
        }, function (err) {
          expect(err).to.be.null();
          expect(ctx.worker.instance).to.equal(ctx.mockInstance);
          done();
        });
      });
    });

    describe('not found', function () {
      beforeEach(function (done) {
        sinon.stub(Instance, 'findOne', function (data, cb) {
          cb(null, null);
        });
        done();
      });
      afterEach(function (done) {
        Instance.findOne.restore();
        done();
      });
      it('should callback error if instance w/ container not found', function (done) {
        ctx.worker._baseWorkerFindInstance({
          _id: ctx.data.instanceId,
          'container.dockerContainer': ctx.data.dockerContainer
        }, function (err) {
          expect(err.message).to.equal('instance not found');
          expect(ctx.worker.instance).to.be.undefined();
          done();
        });
      });
    });

    describe('mongo error', function () {
      beforeEach(function (done) {
        sinon.stub(Instance, 'findOne', function (data, cb) {
          cb(new Error('mongoose error'), null);
        });
        done();
      });
      afterEach(function (done) {
        Instance.findOne.restore();
        done();
      });
      it('should callback error if mongo error', function (done) {
        ctx.worker._baseWorkerFindInstance({
          _id: ctx.data.instanceId,
          'container.dockerContainer': ctx.data.dockerContainer
        }, function (err) {
          expect(err.message).to.equal('mongoose error');
          expect(ctx.worker.instance).to.be.undefined();
          done();
        });
      });
    });
  });

  describe('_baseWorkerFindUser', function () {
    describe('basic', function () {
      beforeEach(function (done) {
        sinon.stub(User, 'findByGithubId', function (sessionUserGithubId, cb) {
          cb(null, ctx.mockUser);
        });
        done();
      });
      afterEach(function (done) {
        User.findByGithubId.restore();
        done();
      });
      it('should query mongo for user', function (done) {
        ctx.worker._baseWorkerFindUser(ctx.data.sessionUserGithubId, function (err) {
          expect(err).to.be.null();
          expect(User.findByGithubId.callCount).to.equal(1);
          expect(User.findByGithubId.args[0][0]).to.equal(ctx.data.sessionUserGithubId);
          expect(User.findByGithubId.args[0][1]).to.be.a.function();
          done();
        });
      });
    });

    describe('found', function () {
      beforeEach(function (done) {
        sinon.stub(User, 'findByGithubId', function (sessionUserGithubId, cb) {
          cb(null, ctx.mockUser);
        });
        done();
      });
      afterEach(function (done) {
        User.findByGithubId.restore();
        done();
      });
      it('should query mongo for user', function (done) {
        ctx.worker._baseWorkerFindUser(ctx.data.sessionUserGithubId, function (err) {
          expect(err).to.be.null();
          expect(ctx.worker.user).to.equal(ctx.mockUser);
          done();
        });
      });
    });

    describe('not found', function () {
      beforeEach(function (done) {
        sinon.stub(User, 'findByGithubId', function (sessionUserGithubId, cb) {
          cb(null, null);
        });
        done();
      });
      afterEach(function (done) {
        User.findByGithubId.restore();
        done();
      });
      it('should query mongo for user', function (done) {
        ctx.worker._baseWorkerFindUser(ctx.data.sessionUserGithubId, function (err) {
          expect(err.message).to.equal('user not found');
          expect(ctx.worker.user).to.be.undefined();
          done();
        });
      });
    });

    describe('mongo error', function () {
      beforeEach(function (done) {
        sinon.stub(User, 'findByGithubId', function (sessionUserGithubId, cb) {
          cb(new Error('mongoose error'), null);
        });
        done();
      });
      afterEach(function (done) {
        User.findByGithubId.restore();
        done();
      });
      it('should query mongo for user', function (done) {
        ctx.worker._baseWorkerFindUser(ctx.data.sessionUserGithubId, function (err) {
          expect(err.message).to.equal('mongoose error');
          expect(ctx.worker.user).to.be.undefined();
          done();
        });
      });
    });
  });

  describe('_baseWorkerInspectContainerAndUpdate', function () {
    beforeEach(function (done) {
      // normally set by _findInstance & _findUser
      ctx.worker.instance = ctx.mockInstance;
      ctx.worker.user = ctx.mockUser;
      ctx.worker.docker = new Docker('0.0.0.0');
      done();
    });

    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(Docker.prototype, 'inspectContainer', function (dockerContainerId, cb) {
          cb(null, ctx.mockContainer);
        });
        done();
      });

      afterEach(function (done) {
        Docker.prototype.inspectContainer.restore();
        done();
      });

      it('should inspect a container and update the database', function (done) {
        ctx.worker._baseWorkerInspectContainerAndUpdate(function (err) {
          expect(err).to.be.undefined();
          expect(Docker.prototype.inspectContainer.callCount).to.equal(1);
          expect(ctx.modifyContainerInspectSpy.callCount).to.equal(1);
          expect(ctx.modifyContainerInspectErrSpy.callCount).to.equal(0);
          done();
        });
      });
    });

    describe('error inspect', function () {
      beforeEach(function (done) {
        sinon.stub(Docker.prototype, 'inspectContainer', function (dockerContainerId, cb) {
          cb(new Error('docker inspect error'));
        });
        done();
      });

      afterEach(function (done) {
        Docker.prototype.inspectContainer.restore();
        done();
      });

      it('should inspect a container and update the database', function (done) {
        ctx.worker._baseWorkerInspectContainerAndUpdate(function (err) {
          expect(err.message).to.equal('docker inspect error');
          expect(Docker.prototype.inspectContainer.callCount)
            .to.equal(process.env.WORKER_INSPECT_CONTAINER_NUMBER_RETRY_ATTEMPTS);
          expect(ctx.modifyContainerInspectSpy.callCount).to.equal(0);
          expect(ctx.modifyContainerInspectErrSpy.callCount).to.equal(1);
          done();
        });
      });
    });

    describe('error update mongo', function () {
      beforeEach(function (done) {
        sinon.stub(Docker.prototype, 'inspectContainer', function (dockerContainerId, cb) {
          cb(null, ctx.mockContainer);
        });
        ctx.modifyContainerInspectSpy = sinon.spy(function (dockerContainerId, inspect, cb) {
          cb(new Error('mongoose error'));
        });
        ctx.mockInstance.modifyContainerInspect = ctx.modifyContainerInspectSpy;
        done();
      });

      afterEach(function (done) {
        Docker.prototype.inspectContainer.restore();
        done();
      });

      it('should inspect a container and update the database', function (done) {
        ctx.worker._baseWorkerInspectContainerAndUpdate(function (err) {
          expect(err.message).to.equal('mongoose error');
          expect(Docker.prototype.inspectContainer.callCount).to.equal(1);
          expect(ctx.modifyContainerInspectSpy.callCount).to.equal(1);
          expect(ctx.modifyContainerInspectErrSpy.callCount).to.equal(0);
          done();
        });
      });
    });
  });
});
