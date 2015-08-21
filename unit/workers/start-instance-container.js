/**
 * @module unit/workers/start-instance-container
 */
'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();

var Code = require('code');
var async = require('async');
var noop = require('101/noop');
var sinon = require('sinon');

var Docker = require('models/apis/docker');
var Hosts = require('models/redis/hosts');
var Instance = require('models/mongo/instance');
var Sauron = require('models/apis/sauron');
var User = require('models/mongo/user');
var messenger = require('socket/messenger');

var StartInstanceContainerWorker = require('workers/start-instance-container');

var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;

describe('StartInstanceContainerWorker', function () {
  var ctx;

  beforeEach(function (done) {
    ctx = {};

    // spies
    ctx.removeStartingStoppingStatesSpy = sinon.spy(function (cb) { cb(); });
    ctx.modifyContainerInspectSpy =
      sinon.spy(function (dockerContainerId, inspect, cb) {
      cb(null, ctx.mockContainer);
    });
    ctx.modifyContainerInspectErrSpy = sinon.spy(function (dockerContainerId, error, cb) {
      cb(null);
    });

    ctx.populateModelsSpy = sinon.spy(function (cb) { cb(null); });
    ctx.populateOwnerAndCreatedBySpy = sinon.spy(function (user, cb) { cb(null, ctx.mockInstance); });

    ctx.data = {
      dockerContainer: 'abc123',
      dockerHost: '0.0.0.0',
      //hostIp: req.instance.network.hostIp,
      instanceId: 'instanceid123',
      //networkIp: req.instance.network.networkIp,
      //ownerUsername: req.sessionUser.accounts.github.login,
      sessionUserGithubId: '12345'
      //tid: req.domain.runnableData.tid
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
      removeStartingStoppingStates: ctx.removeStartingStoppingStatesSpy,
      modifyContainerInspect: ctx.modifyContainerInspectSpy,
      modifyContainerInspectErr: ctx.modifyContainerInspectErrSpy,
      populateModels: ctx.populateModelsSpy,
      populateOwnerAndCreatedBy: ctx.populateOwnerAndCreatedBySpy
    };
    ctx.mockContainer = {
      dockerContainer: ctx.data.dockerContainer,
      dockerHost: ctx.data.dockerHost
    };
    ctx.mockInstance.container = ctx.mockContainer;
    ctx.mockUser = {
      _id: 'foo',
      toJSON: noop
    };
    ctx.worker = new StartInstanceContainerWorker();
    done();
  });

  beforeEach(function (done) {
    // initialize instance w/ props, don't actually run protected methods
    sinon.stub(async, 'series', noop);
    ctx.worker.handle(ctx.data, noop);
    async.series.restore();
    done();
  });

  describe('_finalSeriesHandler', function () {
    describe('failture witout instance', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.worker, '_updateFrontend', noop);
        sinon.stub(ctx.worker, '_inspectContainerAndUpdate', noop);
        done();
      });
      afterEach(function (done) {
        ctx.worker._updateFrontend.restore();
        ctx.worker._inspectContainerAndUpdate.restore();
        done();
      });
      it('it should not inspect or notify frontend', function (done) {
        ctx.worker._finalSeriesHandler(new Error('mongoose error'), function () {
          expect(ctx.worker._updateFrontend.callCount).to.equal(0);
          expect(ctx.worker._inspectContainerAndUpdate.callCount).to.equal(0);
          done();
        });
      });
    });

    describe('failure with instance', function () {
      beforeEach(function (done) {
        ctx.worker.instance = ctx.mockInstance;
        sinon.stub(ctx.worker, '_updateFrontend', noop);
        sinon.stub(ctx.worker, '_inspectContainerAndUpdate', function (cb) { cb(); });
        done();
      });
      afterEach(function (done) {
        ctx.worker._updateFrontend.restore();
        ctx.worker._inspectContainerAndUpdate.restore();
        done();
      });
      it('it should inspect and notify frontend', function (done) {
        ctx.worker._finalSeriesHandler(new Error('mongoose error'), function () {
          expect(ctx.worker._updateFrontend.callCount).to.equal(1);
          expect(ctx.worker._inspectContainerAndUpdate.callCount).to.equal(1);
          expect(ctx.worker._updateFrontend.args[0][0]).to.equal('start-error');
          done();
        });
      });
    });

    describe('success', function () {
      beforeEach(function (done) {
        ctx.worker.instance = ctx.mockInstance;
        sinon.stub(ctx.worker, '_updateFrontend', noop);
        sinon.stub(ctx.worker, '_inspectContainerAndUpdate', function (cb) { cb(); });
        done();
      });
      afterEach(function (done) {
        ctx.worker._updateFrontend.restore();
        ctx.worker._inspectContainerAndUpdate.restore();
        done();
      });
      it('it should NOT inspect and SHOULD notify frontend', function (done) {
        ctx.worker._finalSeriesHandler(null, function () {
          expect(ctx.worker._updateFrontend.callCount).to.equal(1);
          expect(ctx.worker._inspectContainerAndUpdate.callCount).to.equal(0);
          expect(ctx.worker._updateFrontend.args[0][0]).to.equal('start');
          done();
        });
      });
    });
  });

  describe('_findInstance', function () {
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
        ctx.worker._findInstance(function (err) {
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
        ctx.worker._findInstance(function (err) {
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
        ctx.worker._findInstance(function (err) {
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
        ctx.worker._findInstance(function (err) {
          expect(err.message).to.equal('mongoose error');
          expect(ctx.worker.instance).to.be.undefined();
          done();
        });
      });
    });
  });

  describe('_findUser', function () {
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
        ctx.worker._findUser(function (err) {
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
        ctx.worker._findUser(function (err) {
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
        ctx.worker._findUser(function (err) {
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
        ctx.worker._findUser(function (err) {
          expect(err.message).to.equal('mongoose error');
          expect(ctx.worker.user).to.be.undefined();
          done();
        });
      });
    });
  });

  describe('_setInstanceStateStarting', function () {
    beforeEach(function (done) {
      // normally set by _findInstance & _findUser
      ctx.worker.instance = ctx.mockInstance;
      ctx.worker.user = ctx.mockUser;
      done();
    });
    beforeEach(function (done) {
      sinon.stub(ctx.worker, '_updateFrontend', noop);
      ctx.mockInstance.setContainerStateToStarting = function (cb) {
        cb(null, ctx.mockInstance);
      };
      done();
    });
    afterEach(function (done) {
      ctx.worker._updateFrontend.restore();
      done();
    });
    it('should set container state to starting and notify frontend', function (done) {
      ctx.worker._setInstanceStateStarting(function (err) {
        expect(err).to.be.undefined();
        expect(ctx.worker._updateFrontend.callCount).to.equal(1);
        expect(ctx.worker._updateFrontend.args[0][0]).to.equal('starting');
        done();
      });
    });
  });

  describe('_startContainer', function () {
    beforeEach(function (done) {
      // normally set by _findInstance & _findUser
      ctx.worker.instance = ctx.mockInstance;
      ctx.worker.user = ctx.mockUser;
      done();
    });

    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(Docker.prototype, 'startUserContainer', function (dockerContainer, sessionUserGithubId, cb) {
          cb(null);
        });
        done();
      });
      afterEach(function (done) {
        Docker.prototype.startUserContainer.restore();
        done();
      });
      it('should callback successfully if container start', function (done) {
        ctx.worker._startContainer(function (err) {
          expect(err).to.be.null();
          expect(Docker.prototype.startUserContainer.callCount).to.equal(1);
          expect(ctx.removeStartingStoppingStatesSpy.callCount).to.equal(1);
          done();
        });
      });
    });

    describe('failure n times', function () {
      beforeEach(function (done) {
        sinon.stub(Docker.prototype, 'startUserContainer', function (dockerContainer, sessionUserGithubId, cb) {
          cb(new Error('docker start container error'));
        });
        done();
      });
      afterEach(function (done) {
        Docker.prototype.startUserContainer.restore();
        done();
      });
      it('should attempt to start container n times', function (done) {
        ctx.worker._startContainer(function (err) {
          expect(err.message).to.equal('docker start container error');
          expect(Docker.prototype.startUserContainer.callCount)
            .to.equal(process.env.WORKER_START_CONTAINER_NUMBER_RETRY_ATTEMPTS);
          expect(ctx.removeStartingStoppingStatesSpy.callCount).to.equal(1);
          done();
        });
      });
    });
  });

  describe('_inspectContainerAndUpdate', function () {
    beforeEach(function (done) {
      // normally set by _findInstance & _findUser
      ctx.worker.instance = ctx.mockInstance;
      ctx.worker.user = ctx.mockUser;
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
        ctx.worker._inspectContainerAndUpdate(function (err) {
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
        ctx.worker._inspectContainerAndUpdate(function (err) {
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
        ctx.worker._inspectContainerAndUpdate(function (err) {
          expect(err.message).to.equal('mongoose error');
          expect(Docker.prototype.inspectContainer.callCount).to.equal(1);
          expect(ctx.modifyContainerInspectSpy.callCount).to.equal(1);
          expect(ctx.modifyContainerInspectErrSpy.callCount).to.equal(0);
          done();
        });
      });
    });
  });

  describe('_attachContainerToNetwork', function () {
    beforeEach(function (done) {
      // normally set by _findInstance & _findUser
      ctx.worker.instance = ctx.mockInstance;
      ctx.worker.user = ctx.mockUser;
      done();
    });

    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(Sauron.prototype, 'attachHostToContainer',
                   function (networkIp, hostIp, containerId, cb) {
          cb(null);
        });
        sinon.stub(Hosts.prototype, 'upsertHostsForInstance',
                  function (ownerUsername, instance, cb) {
          cb(null);
        });
        done();
      });

      afterEach(function (done) {
        Sauron.prototype.attachHostToContainer.restore();
        Hosts.prototype.upsertHostsForInstance.restore();
        done();
      });

      it('should attach to weave and register with navi', function (done) {
        ctx.worker._attachContainerToNetwork(function (err) {
          expect(err).to.be.undefined();
          expect(Sauron.prototype.attachHostToContainer.callCount).to.equal(1);
          expect(Hosts.prototype.upsertHostsForInstance.callCount).to.equal(1);
          done();
        });
      });
    });
  });

  describe('_updateFrontend', function () {
    beforeEach(function (done) {
      // normally set by _findInstance & _findUser
      ctx.worker.instance = ctx.mockInstance;
      ctx.worker.user = ctx.mockUser;
      done();
    });

    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(Instance, 'findById', function (query, cb) {
          cb(null, ctx.mockInstance);
        });
        sinon.stub(messenger, 'emitInstanceUpdate', function () {});
        done();
      });

      afterEach(function (done) {
        Instance.findById.restore();
        messenger.emitInstanceUpdate.restore();
        done();
      });

      it('should fetch instance and notify frontend via primus instance has started',
      function (done) {
        ctx.worker._updateFrontend();
        expect(Instance.findById.callCount).to.equal(1);
        expect(Instance.findById.args[0][0]).to.equal(ctx.data.instanceId);
        expect(ctx.populateModelsSpy.callCount).to.equal(1);
        expect(ctx.populateOwnerAndCreatedBySpy.callCount).to.equal(1);
        expect(messenger.emitInstanceUpdate.callCount).to.equal(1);
        done();
      });
    });
  });
});
