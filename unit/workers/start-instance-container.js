/**
 * @module unit/workers/start-instance-container
 */
'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();

var Code = require('code');
var async = require('async');
var noop = require('101/noop');
var put = require('101/put');
var rewire = require('rewire');
var sinon = require('sinon');

var Docker = require('models/apis/docker');
var Hosts = require('models/redis/hosts');
var Instance = require('models/mongo/instance');
var Sauron = require('models/apis/sauron');
var User = require('models/mongo/user');
var messenger = require('socket/messenger');

var StartInstanceContainerWorker = rewire('workers/start-instance-container');

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
      removeStartingStoppingStates: ctx.removeStartingStoppingStatesSpy
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
        ctx.worker._findUser(function (err, user) {
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
        ctx.worker._findUser(function (err, user) {
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
        ctx.worker._findUser(function (err, user) {
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
        ctx.worker._findUser(function (err, user) {
          expect(err.message).to.equal('mongoose error');
          expect(ctx.worker.user).to.be.undefined();
          done();
        });
      });
    });
  });

  describe('_startContainer', function () {
    beforeEach(function (done) {
      // set by _findInstance & _findUser normally
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
          cb(new Error('docker error'));
        });
        done();
      });
      afterEach(function (done) {
        Docker.prototype.startUserContainer.restore();
        done();
      });
      it('should attempt to start container n times', function (done) {
        ctx.worker._startContainer(function (err) {
          expect(err.message).to.equal('docker error');
          expect(Docker.prototype.startUserContainer.callCount)
            .to.equal(parseInt(process.env.WORKER_START_CONTAINER_NUMBER_RETRY_ATTEMPTS));
          expect(ctx.removeStartingStoppingStatesSpy.callCount).to.equal(1);
          done();
        });
      });
    });
  });

  describe('_inspectContainerAndUpdate', function () {
  });

  describe('_attachContainerToNetwork', function () {
  });

  describe('_updateFrontend', function () {
  });


  //---------------------------------------------------
/*
  describe('findInstance error', function () {
    beforeEach(function (done) {
      sinon.stub(User, 'findByGithubId', function () {});
      sinon.stub(Instance, 'findOne', function (data, cb) {
        cb(null, null);
      });
      done();
    });

    afterEach(function (done) {
      User.findByGithubId.restore();
      Instance.findOne.restore();
      done();
    });

    it('should callback error if instance w/ dockerContainer not found', function (done) {
      // signifies container may have changed on instance since request initiated
      StartInstanceContainerWorker.worker(ctx.data, function (err) {
        expect(err.message).to.equal('instance not found');
        expect(User.findByGithubId.callCount).to.equal(0);
        expect(Instance.findOne.callCount).to.equal(1);
        expect(Instance.findOne.args[0][0]).to.only.contain({
          '_id': ctx.data.instanceId,
          'container.dockerContainer': ctx.data.dockerContainer
        });
      }, done);
    });
  });

  describe('findInstance success - findUser error', function () {
    beforeEach(function (done) {
      ctx.populateModelsSpy = sinon.spy(function (cb) { cb(null); });
      ctx.populateOwnerAndCreatedBySpy = sinon.spy(function (data, cb) {
        cb(null, ctx.mockInstance);
      });
      ctx.mockInstance = {
        _id: ctx.data.instanceId,
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
        populateModels: ctx.populateModelsSpy,
        populateOwnerAndCreatedBy: ctx.populateOwnerAndCreatedBySpy
      };
      sinon.stub(User, 'findByGithubId', function (githubId, cb) {
        expect(githubId).to.equal(ctx.data.sessionUserGithubId);
        cb(null, null);
      });
      sinon.stub(Instance, 'findOne', function (data, cb) {
        cb(null, ctx.mockInstance);
      });
      sinon.stub(Instance, 'findById', function (instanceId, cb) {
        cb(null, ctx.mockInstance);
      });
      sinon.stub(Docker.prototype, 'startUserContainer', function () {});
      sinon.stub(messenger, 'emitInstanceUpdate', function () {});
      done();
    });

    afterEach(function (done) {
      User.findByGithubId.restore();
      Instance.findOne.restore();
      Instance.findById.restore();
      Docker.prototype.startUserContainer.restore();
      messenger.emitInstanceUpdate.restore();
      done();
    });

    it('should callback error if user not found', function (done) {
      // signifies container may have changed on instance since request initiated
      StartInstanceContainerWorker.worker(ctx.data, function (err) {
        expect(err.message).to.equal('user not found');
        expect(Docker.prototype.startUserContainer.callCount).to.equal(0);

        expect(User.findByGithubId.callCount).to.equal(1);

        expect(Instance.findOne.callCount).to.equal(1);
        expect(Instance.findOne.args[0][0]).to.only.contain({
          '_id': ctx.data.instanceId,
          'container.dockerContainer': ctx.data.dockerContainer
        });
        expect(Instance.findOne.args[0][1]).to.be.a.function();

        expect(Instance.findById.callCount).to.equal(1);
        //expect(Instance.findById.args[0][0]).to.equal();
        expect(ctx.populateModelsSpy.callCount).to.equal(1);
        expect(ctx.populateOwnerAndCreatedBySpy.callCount).to.equal(1);
      }, done);
    });
  });

  describe('findInstance & findUser success - startContainer error', function () {
    beforeEach(function (done) {
      ctx.populateModelsSpy = sinon.spy(function (cb) { cb(null); });
      ctx.populateOwnerAndCreatedBySpy = sinon.spy(function (data, cb) {
        cb(null, ctx.mockInstance);
      });
      ctx.removeStartingStoppingStatesSpy = sinon.spy(function (cb) { cb(); });
      ctx.userToJSONSpy = sinon.spy(function () {
        var copy = put({}, ctx.mockUser);
        delete copy.toJSON;
        return copy;
      });
      ctx.mockInstance = {
        _id: ctx.data.instanceId,
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
        populateModels: ctx.populateModelsSpy,
        populateOwnerAndCreatedBy: ctx.populateOwnerAndCreatedBySpy,
        removeStartingStoppingStates: ctx.removeStartingStoppingStatesSpy
      };
      ctx.mockUser = {
        _id: 'foo',
        toJSON: ctx.userToJSONSpy
      };
      sinon.stub(User, 'findByGithubId', function (githubId, cb) {
        expect(githubId).to.equal(ctx.data.sessionUserGithubId);
        cb(null, ctx.mockUser);
      });
      sinon.stub(Instance, 'findOne', function (data, cb) {
        cb(null, ctx.mockInstance);
      });
      sinon.stub(Instance, 'findById', function (instanceId, cb) {
        cb(null, ctx.mockInstance);
      });
      sinon.stub(Docker.prototype, 'startUserContainer', function (containerId, ownerId, cb) {
        cb(new Error('start container docker error'));
      });
      sinon.stub(messenger, 'emitInstanceUpdate', function () {});
      done();
    });

    afterEach(function (done) {
      User.findByGithubId.restore();
      Instance.findOne.restore();
      Instance.findById.restore();
      Docker.prototype.startUserContainer.restore();
      messenger.emitInstanceUpdate.restore();
      done();
    });

    it('should callback error if startContainer fails repeatedly', function (done) {
      // signifies container may have changed on instance since request initiated
      StartInstanceContainerWorker.worker(ctx.data, function (err) {
        expect(err.message).to.equal('start container docker error');
        expect(Docker.prototype.startUserContainer.callCount)
          .to.equal(parseInt(process.env.WORKER_START_CONTAINER_NUMBER_RETRY_ATTEMPTS));

        expect(User.findByGithubId.callCount).to.equal(1);

        expect(Instance.findOne.callCount).to.equal(1);
        expect(Instance.findOne.args[0][0]).to.only.contain({
          '_id': ctx.data.instanceId,
          'container.dockerContainer': ctx.data.dockerContainer
        });
        expect(Instance.findOne.args[0][1]).to.be.a.function();

        expect(Instance.findById.callCount).to.equal(1);
        expect(ctx.populateModelsSpy.callCount).to.equal(1);
        expect(ctx.populateOwnerAndCreatedBySpy.callCount).to.equal(1);
        expect(ctx.removeStartingStoppingStatesSpy.callCount).to.equal(1);
      }, done);
    });
  });

  describe('findInstance & findUser & startContainer success - inspectContainerAndUpdate error', function () {
    beforeEach(function (done) {
      ctx.populateModelsSpy = sinon.spy(function (cb) { cb(null); });
      ctx.populateOwnerAndCreatedBySpy = sinon.spy(function (data, cb) {
        cb(null, ctx.mockInstance);
      });
      ctx.removeStartingStoppingStatesSpy = sinon.spy(function (cb) { cb(); });
      ctx.modifyContainerInspectErrSpy = sinon.spy(function (container, err, cb) { cb(); });
      ctx.userToJSONSpy = sinon.spy(function () {
        var copy = put({}, ctx.mockUser);
        delete copy.toJSON;
        return copy;
      });
      ctx.mockInstance = {
        _id: ctx.data.instanceId,
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
        populateModels: ctx.populateModelsSpy,
        populateOwnerAndCreatedBy: ctx.populateOwnerAndCreatedBySpy,
        removeStartingStoppingStates: ctx.removeStartingStoppingStatesSpy,
        modifyContainerInspectErr: ctx.modifyContainerInspectErrSpy
      };
      ctx.mockUser = {
        _id: 'foo',
        toJSON: ctx.userToJSONSpy
      };
      sinon.stub(User, 'findByGithubId', function (githubId, cb) {
        expect(githubId).to.equal(ctx.data.sessionUserGithubId);
        cb(null, ctx.mockUser);
      });
      sinon.stub(Instance, 'findOne', function (data, cb) {
        cb(null, ctx.mockInstance);
      });
      sinon.stub(Instance, 'findById', function (instanceId, cb) {
        cb(null, ctx.mockInstance);
      });
      sinon.stub(Docker.prototype, 'startUserContainer', function (containerId, ownerId, cb) {
        cb(null);
      });
      sinon.stub(Docker.prototype, 'inspectContainer', function (containerId, cb) {
        cb(new Error('inspect container docker error'));
      });
      sinon.stub(messenger, 'emitInstanceUpdate', function () {});
      done();
    });

    afterEach(function (done) {
      User.findByGithubId.restore();
      Instance.findOne.restore();
      Instance.findById.restore();
      Docker.prototype.startUserContainer.restore();
      Docker.prototype.inspectContainer.restore();
      messenger.emitInstanceUpdate.restore();
      done();
    });

    it('should callback error inspect operation fails repeatedly', function (done) {
      // signifies container may have changed on instance since request initiated
      StartInstanceContainerWorker.worker(ctx.data, function (err) {
        expect(err.message).to.equal('inspect container docker error');
        expect(Docker.prototype.startUserContainer.callCount).to.equal(1);
        expect(Docker.prototype.inspectContainer.callCount)
          .to.equal(process.env.WORKER_INSPECT_CONTAINER_NUMBER_RETRY_ATTEMPTS);
        expect(ctx.modifyContainerInspectErrSpy.callCount).to.equal(1);

        expect(User.findByGithubId.callCount).to.equal(1);

        expect(Instance.findOne.callCount).to.equal(1);
        expect(Instance.findOne.args[0][0]).to.only.contain({
          '_id': ctx.data.instanceId,
          'container.dockerContainer': ctx.data.dockerContainer
        });
        expect(Instance.findOne.args[0][1]).to.be.a.function();

        expect(Instance.findById.callCount).to.equal(1);
        expect(ctx.populateModelsSpy.callCount).to.equal(1);
        expect(ctx.populateOwnerAndCreatedBySpy.callCount).to.equal(1);
        expect(ctx.removeStartingStoppingStatesSpy.callCount).to.equal(1);

      }, done);
    });
  });

  describe('findInstance & findUser & startContainer & inspectContainerAndUpdate success '+
           '- attachContainerToNetwork error', function () {
    beforeEach(function (done) {
      ctx.populateModelsSpy = sinon.spy(function (cb) { cb(null); });
      ctx.populateOwnerAndCreatedBySpy = sinon.spy(function (data, cb) {
        cb(null, ctx.mockInstance);
      });
      ctx.removeStartingStoppingStatesSpy = sinon.spy(function (cb) { cb(); });
      ctx.modifyContainerInspectErrSpy = sinon.spy(function (container, err, cb) { cb(); });
      ctx.modifyContainerInspectSpy = sinon.spy(function (container, err, cb) {
        cb(null, {
          inspect: {}
        });
      });
      ctx.userToJSONSpy = sinon.spy(function () {
        var copy = put({}, ctx.mockUser);
        delete copy.toJSON;
        return copy;
      });
      ctx.mockInstance = {
        _id: ctx.data.instanceId,
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
        populateModels: ctx.populateModelsSpy,
        populateOwnerAndCreatedBy: ctx.populateOwnerAndCreatedBySpy,
        removeStartingStoppingStates: ctx.removeStartingStoppingStatesSpy,
        modifyContainerInspectErr: ctx.modifyContainerInspectErrSpy,
        modifyContainerInspect: ctx.modifyContainerInspectSpy
      };
      ctx.mockUser = {
        _id: 'foo',
        toJSON: ctx.userToJSONSpy
      };
      sinon.stub(User, 'findByGithubId', function (githubId, cb) {
        expect(githubId).to.equal(ctx.data.sessionUserGithubId);
        cb(null, ctx.mockUser);
      });
      sinon.stub(Instance, 'findOne', function (data, cb) {
        cb(null, ctx.mockInstance);
      });
      sinon.stub(Instance, 'findById', function (instanceId, cb) {
        cb(null, ctx.mockInstance);
      });
      sinon.stub(Docker.prototype, 'startUserContainer', function (containerId, ownerId, cb) {
        cb(null);
      });
      sinon.stub(Docker.prototype, 'inspectContainer', function (containerId, cb) {
        cb(null);
      });
      sinon.stub(Sauron.prototype, 'attachHostToContainer', function (networKIp, hostIp, dockerContainer, cb) {
        cb(new Error('sauron error'));
      });
      sinon.stub(Hosts.prototype, 'upsertHostsForInstance', function (ownerUsername, instance, cb) {
        cb();
      });
      sinon.stub(messenger, 'emitInstanceUpdate', function () {});
      done();
    });

    afterEach(function (done) {
      User.findByGithubId.restore();
      Instance.findOne.restore();
      Instance.findById.restore();
      Docker.prototype.startUserContainer.restore();
      Docker.prototype.inspectContainer.restore();
      messenger.emitInstanceUpdate.restore();
      Sauron.prototype.attachHostToContainer.restore();
      Hosts.prototype.upsertHostsForInstance.restore();
      done();
    });

    it('should callback error sauron.attachHostToContainer failure', function (done) {
      // signifies container may have changed on instance since request initiated
      StartInstanceContainerWorker.worker(ctx.data, function (err) {
        expect(err.message).to.equal('sauron error');
        expect(Docker.prototype.startUserContainer.callCount).to.equal(1);
        expect(Docker.prototype.inspectContainer.callCount).to.equal(1);
        expect(ctx.modifyContainerInspectErrSpy.callCount).to.equal(0);
        expect(ctx.modifyContainerInspectSpy.callCount).to.equal(1);

        expect(User.findByGithubId.callCount).to.equal(1);

        expect(Instance.findOne.callCount).to.equal(1);
        expect(Instance.findOne.args[0][0]).to.only.contain({
          '_id': ctx.data.instanceId,
          'container.dockerContainer': ctx.data.dockerContainer
        });
        expect(Instance.findOne.args[0][1]).to.be.a.function();

        expect(Instance.findById.callCount).to.equal(1);
        expect(ctx.populateModelsSpy.callCount).to.equal(1);
        expect(ctx.populateOwnerAndCreatedBySpy.callCount).to.equal(1);
        expect(ctx.removeStartingStoppingStatesSpy.callCount).to.equal(1);
      }, done);
    });

    it('should callback error hosts.upsertHostsForInstance failure', function (done) {
      Sauron.prototype.attachHostToContainer.restore();
      sinon.stub(Sauron.prototype, 'attachHostToContainer', function (networKIp, hostIp, dockerContainer, cb) {
        cb(null);
      });
      Hosts.prototype.upsertHostsForInstance.restore();
      sinon.stub(Hosts.prototype, 'upsertHostsForInstance', function (ownerUsername, instance, cb) {
        cb(new Error('hosts error'));
      });
      // signifies container may have changed on instance since request initiated
      StartInstanceContainerWorker.worker(ctx.data, function (err) {
        expect(err.message).to.equal('hosts error');
        expect(Docker.prototype.startUserContainer.callCount).to.equal(1);
        expect(Docker.prototype.inspectContainer.callCount).to.equal(1);
        expect(ctx.modifyContainerInspectErrSpy.callCount).to.equal(0);
        expect(ctx.modifyContainerInspectSpy.callCount).to.equal(1);

        expect(User.findByGithubId.callCount).to.equal(1);

        expect(Instance.findOne.callCount).to.equal(1);
        expect(Instance.findOne.args[0][0]).to.only.contain({
          '_id': ctx.data.instanceId,
          'container.dockerContainer': ctx.data.dockerContainer
        });
        expect(Instance.findOne.args[0][1]).to.be.a.function();

        expect(Instance.findById.callCount).to.equal(1);
        expect(ctx.populateModelsSpy.callCount).to.equal(1);
        expect(ctx.populateOwnerAndCreatedBySpy.callCount).to.equal(1);
        expect(ctx.removeStartingStoppingStatesSpy.callCount).to.equal(1);
      }, done);
    });
  });

  describe('findInstance & findUser & startContainer & inspectContainerAndUpdate & '+
           'attachContainerToNetwork success', function () {
    beforeEach(function (done) {
      ctx.populateModelsSpy = sinon.spy(function (cb) { cb(null); });
      ctx.populateOwnerAndCreatedBySpy = sinon.spy(function (data, cb) {
        cb(null, ctx.mockInstance);
      });
      ctx.removeStartingStoppingStatesSpy = sinon.spy(function (cb) { cb(); });
      ctx.modifyContainerInspectErrSpy = sinon.spy(function (container, err, cb) { cb(); });
      ctx.modifyContainerInspectSpy = sinon.spy(function (container, err, cb) {
        cb(null, {
          inspect: {}
        });
      });
      ctx.userToJSONSpy = sinon.spy(function () {
        var copy = put({}, ctx.mockUser);
        delete copy.toJSON;
        return copy;
      });
      ctx.mockInstance = {
        _id: ctx.data.instanceId,
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
        populateModels: ctx.populateModelsSpy,
        populateOwnerAndCreatedBy: ctx.populateOwnerAndCreatedBySpy,
        removeStartingStoppingStates: ctx.removeStartingStoppingStatesSpy,
        modifyContainerInspectErr: ctx.modifyContainerInspectErrSpy,
        modifyContainerInspect: ctx.modifyContainerInspectSpy
      };
      ctx.mockUser = {
        _id: 'foo',
        toJSON: ctx.userToJSONSpy
      };
      sinon.stub(User, 'findByGithubId', function (githubId, cb) {
        expect(githubId).to.equal(ctx.data.sessionUserGithubId);
        cb(null, ctx.mockUser);
      });
      sinon.stub(Instance, 'findOne', function (data, cb) {
        cb(null, ctx.mockInstance);
      });
      sinon.stub(Instance, 'findById', function (instanceId, cb) {
        cb(null, ctx.mockInstance);
      });
      sinon.stub(Docker.prototype, 'startUserContainer', function (containerId, ownerId, cb) {
        cb(null);
      });
      sinon.stub(Docker.prototype, 'inspectContainer', function (containerId, cb) {
        cb(null);
      });
      sinon.stub(Sauron.prototype, 'attachHostToContainer', function (networKIp, hostIp, dockerContainer, cb) {
        cb();
      });
      sinon.stub(Hosts.prototype, 'upsertHostsForInstance', function (ownerUsername, instance, cb) {
        cb();
      });
      sinon.stub(messenger, 'emitInstanceUpdate', function () {});
      done();
    });

    afterEach(function (done) {
      User.findByGithubId.restore();
      Instance.findOne.restore();
      Instance.findById.restore();
      Docker.prototype.startUserContainer.restore();
      Docker.prototype.inspectContainer.restore();
      messenger.emitInstanceUpdate.restore();
      Sauron.prototype.attachHostToContainer.restore();
      Hosts.prototype.upsertHostsForInstance.restore();
      done();
    });

    it('should callback error hosts.upsertHostsForInstance failure', function (done) {
      // signifies container may have changed on instance since request initiated
      StartInstanceContainerWorker.worker(ctx.data, function (err) {
        expect(err).to.be.undefined();

        expect(Sauron.prototype.attachHostToContainer.callCount).to.equal(1);
        expect(Hosts.prototype.upsertHostsForInstance.callCount).to.equal(1);

        expect(Docker.prototype.startUserContainer.callCount).to.equal(1);
        expect(Docker.prototype.inspectContainer.callCount).to.equal(1);

        expect(ctx.modifyContainerInspectErrSpy.callCount).to.equal(0);
        expect(ctx.modifyContainerInspectSpy.callCount).to.equal(1);

        expect(User.findByGithubId.callCount).to.equal(1);

        expect(Instance.findOne.callCount).to.equal(1);
        expect(Instance.findOne.args[0][0]).to.only.contain({
          '_id': ctx.data.instanceId,
          'container.dockerContainer': ctx.data.dockerContainer
        });
        expect(Instance.findOne.args[0][1]).to.be.a.function();

        expect(Instance.findById.callCount).to.equal(1);
        expect(ctx.populateModelsSpy.callCount).to.equal(1);
        expect(ctx.populateOwnerAndCreatedBySpy.callCount).to.equal(1);
        expect(ctx.removeStartingStoppingStatesSpy.callCount).to.equal(1);
      }, done);
    });
  });
*/
});
