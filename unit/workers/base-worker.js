/**
 * @module unit/workers/base-worker
 */
'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();

var Code = require('code');
var noop = require('101/noop');
var put = require('101/put');
var sinon = require('sinon');

var BaseWorker = require('workers/base-worker');
var Build = require('models/mongo/build');
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
    ctx.mockBuild = {
      '_id': 'dsfadsfadsfadsfasdf',
      name: 'name1'
    };
    ctx.mockContainer = {
      dockerContainer: ctx.data.dockerContainer,
      dockerHost: ctx.data.dockerHost
    };
    ctx.mockInstanceSparse = {
      '_id': ctx.data.instanceId,
      name: 'name1',
      populateModels: function () {},
      populateOwnerAndCreatedBy: function () {},
      container: ctx.mockContainer,
      removeStartingStoppingStates: ctx.removeStartingStoppingStatesSpy,
      modifyContainerInspect: ctx.modifyContainerInspectSpy,
      modifyContainerInspectErr: ctx.modifyContainerInspectErrSpy,
    };
    ctx.mockInstance = put({
      owner: {
        github: '',
        username: 'foo',
        gravatar: ''
      },
      createdBy: {
        github: '',
        username: '',
        gravatar: ''
      }
    }, ctx.mockInstanceSparse);
    ctx.mockUser = {
      github: '',
      username: '',
      gravatar: ''
    };
    ctx.worker = new BaseWorker(ctx.data);
    done();
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
  
  describe('_updateFrontendWithContextVersion', function () {
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

  describe('_updateInstanceFrontend', function () {
    beforeEach(function (done) {
      sinon.stub(Instance, 'findOne').yieldsAsync(null, ctx.mockInstanceSparse);
      sinon.stub(ctx.mockInstanceSparse, 'populateModels').yieldsAsync(null);
      sinon.stub(ctx.mockInstanceSparse, 'populateOwnerAndCreatedBy')
        .yieldsAsync(null, ctx.mockInstance);
      sinon.stub(messenger, 'emitInstanceUpdate');
      done();
    });
    afterEach(function (done) {
      Instance.findOne.restore();
      ctx.mockInstanceSparse.populateModels.restore();
      ctx.mockInstanceSparse.populateOwnerAndCreatedBy.restore();
      messenger.emitInstanceUpdate.restore();
      done();
    });
    describe('success', function () {
      beforeEach(function (done) {
        ctx.worker.user = ctx.mockUser;
        done();
      });
      it('should fetch the instance with the query and emit the update', function (done) {
        var query = {
          hello: 'howdy'
        };
        ctx.worker._updateInstanceFrontend(query, 'starting', function (err) {
          expect(err).to.be.undefined();
          expect(Instance.findOne.callCount).to.equal(1);
          expect(Instance.findOne.args[0][0]).to.deep.equal(query);
          expect(ctx.mockInstanceSparse.populateModels.callCount).to.equal(1);
          expect(ctx.mockInstanceSparse.populateOwnerAndCreatedBy.callCount).to.equal(1);
          expect(ctx.mockInstanceSparse.populateOwnerAndCreatedBy.args[0][0])
            .to.deep.equal(ctx.worker.user);
          expect(
            messenger.emitInstanceUpdate.callCount,
            'emitContextVersionUpdate'
          ).to.equal(1);
          expect(
            messenger.emitInstanceUpdate.args[0][0],
            'emitContextVersionUpdate arg0'
          ).to.equal(ctx.mockInstance);
          expect(
            messenger.emitInstanceUpdate.args[0][1],
            'emitContextVersionUpdate arg0'
          ).to.equal('starting');
          done();
        });
      });
      it('should fetch the instance without the query and emit the update', function (done) {
        ctx.worker.instanceId = ctx.mockInstance._id;
        ctx.worker._updateInstanceFrontend('starting', function (err) {
          expect(err).to.be.undefined();
          expect(Instance.findOne.callCount).to.equal(1);
          expect(Instance.findOne.args[0][0]).to.deep.equal({ _id: ctx.mockInstance._id });
          expect(ctx.mockInstanceSparse.populateModels.callCount).to.equal(1);
          expect(ctx.mockInstanceSparse.populateOwnerAndCreatedBy.callCount).to.equal(1);
          expect(ctx.mockInstanceSparse.populateOwnerAndCreatedBy.args[0][0])
            .to.deep.equal(ctx.worker.user);
          expect(
            messenger.emitInstanceUpdate.callCount,
            'emitContextVersionUpdate'
          ).to.equal(1);
          expect(
            messenger.emitInstanceUpdate.args[0][0],
            'emitContextVersionUpdate arg0'
          ).to.equal(ctx.mockInstance);
          expect(
            messenger.emitInstanceUpdate.args[0][1],
            'emitContextVersionUpdate arg0'
          ).to.equal('starting');
          done();
        });
      });
    });
    describe('failure', function () {
      describe('before doing anything', function () {
        it('should fail when no query given, and no instanceId', function (done) {
          ctx.worker._updateInstanceFrontend('starting', function (err) {
            expect(messenger.emitInstanceUpdate.callCount, 'emitInstanceUpdate').to.equal(0);
            expect(err.message).to.equal('Missing instanceId');
            done();
          });
        });
        it('should fail when missing a user', function (done) {
          ctx.worker.instanceId = ctx.mockInstance._id;
          ctx.worker._updateInstanceFrontend('starting', function (err) {
            expect(messenger.emitInstanceUpdate.callCount, 'emitInstanceUpdate').to.equal(0);
            expect(err.message).to.equal('Missing User');
            done();
          });
        });
      });
      describe('failing on any of the external methods', function () {
        beforeEach(function (done) {
          ctx.worker.user = ctx.mockUser;
          ctx.worker.instanceId = ctx.mockInstance._id;
          done();
        });
        var testError = new Error('Generic Database error');

        it('should fail and return in findOne', function (done) {
          Instance.findOne.yieldsAsync(testError);
          ctx.worker._updateInstanceFrontend({}, 'starting', function (err) {
            expect(err).to.equal(testError);
            expect(Instance.findOne.callCount).to.equal(1);
            expect(Instance.findOne.args[0][0]).to.deep.equal({});
            expect(ctx.mockInstanceSparse.populateModels.callCount).to.equal(0);
            done();
          });
        });
        it('should fail and return in findOne when no instance found', function (done) {
          Instance.findOne.yieldsAsync();
          ctx.worker._updateInstanceFrontend({}, 'starting', function (err) {
            expect(err.message).to.equal('instance not found');
            expect(Instance.findOne.callCount).to.equal(1);
            expect(ctx.mockInstanceSparse.populateModels.callCount).to.equal(0);
            done();
          });
        });
        it('should fail and return in ctx.mockInstanceSparse', function (done) {
          ctx.mockInstanceSparse.populateModels.yieldsAsync(testError);
          ctx.worker._updateInstanceFrontend('starting', function (err) {
            expect(err).to.equal(testError);
            expect(Instance.findOne.callCount).to.equal(1);
            expect(ctx.mockInstanceSparse.populateModels.callCount).to.equal(1);
            expect(ctx.mockInstanceSparse.populateOwnerAndCreatedBy.callCount).to.equal(0);
            done();
          });
        });
        it('should fail and return in ctx.mockInstanceSparse', function (done) {
          ctx.mockInstanceSparse.populateOwnerAndCreatedBy.yieldsAsync(testError);
          ctx.worker._updateInstanceFrontend('starting', function (err) {
            expect(err).to.equal(testError);
            expect(Instance.findOne.callCount).to.equal(1);
            expect(ctx.mockInstanceSparse.populateModels.callCount).to.equal(1);
            expect(ctx.mockInstanceSparse.populateOwnerAndCreatedBy.callCount).to.equal(1);
            expect(messenger.emitInstanceUpdate.callCount).to.equal(0);
            done();
          });
        });
      });
    });
  });

  describe('pUpdateInstanceFrontend', function () {
    beforeEach(function (done) {
      sinon.stub(Instance, 'findOne').yieldsAsync(null, ctx.mockInstanceSparse);
      sinon.stub(ctx.mockInstanceSparse, 'populateModels').yieldsAsync(null);
      sinon.stub(ctx.mockInstanceSparse, 'populateOwnerAndCreatedBy')
        .yieldsAsync(null, ctx.mockInstance);
      sinon.stub(messenger, 'emitInstanceUpdate');
      done();
    });
    afterEach(function (done) {
      Instance.findOne.restore();
      ctx.mockInstanceSparse.populateModels.restore();
      ctx.mockInstanceSparse.populateOwnerAndCreatedBy.restore();
      messenger.emitInstanceUpdate.restore();
      done();
    });
    describe('success', function () {
      beforeEach(function (done) {
        ctx.worker.user = ctx.mockUser;
        done();
      });
      it('should fetch the instance with the query and emit the update', function (done) {
        var query = {
          hello: 'howdy'
        };
        ctx.worker.pUpdateInstanceFrontend(query, 'starting')
          .then(function () {
            expect(Instance.findOne.callCount).to.equal(1);
            expect(Instance.findOne.args[0][0]).to.deep.equal(query);
            expect(ctx.mockInstanceSparse.populateModels.callCount).to.equal(1);
            expect(ctx.mockInstanceSparse.populateOwnerAndCreatedBy.callCount).to.equal(1);
            expect(ctx.mockInstanceSparse.populateOwnerAndCreatedBy.args[0][0])
              .to.deep.equal(ctx.worker.user);
            expect(
              messenger.emitInstanceUpdate.callCount,
              'emitContextVersionUpdate'
            ).to.equal(1);
            expect(
              messenger.emitInstanceUpdate.args[0][0],
              'emitContextVersionUpdate arg0'
            ).to.equal(ctx.mockInstance);
            expect(
              messenger.emitInstanceUpdate.args[0][1],
              'emitContextVersionUpdate arg0'
            ).to.equal('starting');
            done();
          })
          .catch(done);
      });
      it('should fetch the instance without the query and emit the update', function (done) {
        ctx.worker.instanceId = ctx.mockInstance._id;
        ctx.worker.pUpdateInstanceFrontend('starting')
          .then(function () {
            expect(Instance.findOne.callCount).to.equal(1);
            expect(Instance.findOne.args[0][0]).to.deep.equal({_id: ctx.mockInstance._id});
            expect(ctx.mockInstanceSparse.populateModels.callCount).to.equal(1);
            expect(ctx.mockInstanceSparse.populateOwnerAndCreatedBy.callCount).to.equal(1);
            expect(ctx.mockInstanceSparse.populateOwnerAndCreatedBy.args[0][0])
              .to.deep.equal(ctx.worker.user);
            expect(
              messenger.emitInstanceUpdate.callCount,
              'emitContextVersionUpdate'
            ).to.equal(1);
            expect(
              messenger.emitInstanceUpdate.args[0][0],
              'emitContextVersionUpdate arg0'
            ).to.equal(ctx.mockInstance);
            expect(
              messenger.emitInstanceUpdate.args[0][1],
              'emitContextVersionUpdate arg0'
            ).to.equal('starting');
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

  describe('pFindInstance', function () {
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
        ctx.worker.pFindInstance({
          '_id': ctx.data.instanceId,
          'container.dockerContainer': ctx.dockerContainerId
        })
          .then(function () {
            expect(Instance.findOne.callCount).to.equal(1);
            expect(Instance.findOne.args[0][0]).to.only.contain({
              '_id': ctx.data.instanceId,
              'container.dockerContainer': ctx.dockerContainerId
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
        ctx.worker.pFindInstance({
          '_id': ctx.data.instanceId,
          'container.dockerContainer': ctx.dockerContainerId
        })
          .then(function () {
          expect(ctx.worker.instance).to.equal(ctx.mockInstance);
          done();
        });
      });
    });

    describe('not found', function () {
      beforeEach(function (done) {
        sinon.stub(Instance, 'findOne').yieldsAsync(null, null);
        done();
      });
      afterEach(function (done) {
        Instance.findOne.restore();
        done();
      });
      it('should callback error if instance w/ container not found', function (done) {
        ctx.worker.pFindInstance({
          '_id': ctx.data.instanceId,
          'container.dockerContainer': ctx.data.dockerContainer
        })
          .catch(function (err) {
            expect(err.message).to.equal('instance not found');
            expect(ctx.worker.instance).to.be.undefined();
            done();
          });
      });
    });

    describe('mongo error', function () {
      beforeEach(function (done) {
        sinon.stub(Instance, 'findOne').yieldsAsync(new Error('mongoose error'));
        done();
      });
      afterEach(function (done) {
        Instance.findOne.restore();
        done();
      });
      it('should callback error if mongo error', function (done) {
        ctx.worker.pFindInstance({
          '_id': ctx.data.instanceId,
          'container.dockerContainer': ctx.data.dockerContainer
        })
          .catch(function (err) {
            expect(err.message).to.equal('mongoose error');
            expect(ctx.worker.instance).to.be.undefined();
            done();
          });
      });
    });
  });

  describe('pFindBuild', function () {
    var query = {
      '_id': 'dfasdfasdf'
    };
    describe('basic', function () {
      beforeEach(function (done) {
        sinon.stub(Build, 'findOne', function (id, cb) {
          cb(null, ctx.mockBuild);
        });
        done();
      });
      afterEach(function (done) {
        Build.findOne.restore();
        done();
      });
      it('should query mongo for build', function (done) {
        ctx.worker.pFindBuild(query)
          .then(function () {
            expect(Build.findOne.callCount).to.equal(1);
            expect(Build.findOne.args[0][0]).to.only.contain({
              '_id': 'dfasdfasdf'
            });
            expect(Build.findOne.args[0][1]).to.be.a.function();
            done();
          });
      });
    });

    describe('found', function () {
      beforeEach(function (done) {
        sinon.stub(Build, 'findOne', function (id, cb) {
          cb(null, ctx.mockBuild);
        });
        done();
      });
      afterEach(function (done) {
        Build.findOne.restore();
        done();
      });
      it('should callback successfully if instance w/ container found', function (done) {
        ctx.worker.pFindBuild(query)
          .then(function (build) {
            expect(build).to.equal(ctx.mockBuild);
            expect(ctx.worker.build).to.equal(ctx.mockBuild);
            done();
          });
      });
    });

    describe('Errors', function () {
      afterEach(function (done) {
        Build.findOne.restore();
        done();
      });
      it('should callback error if build not found', function (done) {
        sinon.stub(Build, 'findOne', function (id, cb) {
          cb();
        });
        ctx.worker.pFindBuild(query)
          .catch(function (err) {
            expect(err.message).to.equal('Build not found');
            expect(ctx.worker.build).to.be.undefined();
            done();
          });
      });
      it('should callback error if mongo error', function (done) {
        sinon.stub(Build, 'findOne', function (id, cb) {
          cb(new Error('mongoose error'));
        });
        ctx.worker.pFindBuild(query)
          .catch(function (err) {
            expect(err.message).to.equal('mongoose error');
            expect(ctx.worker.build).to.be.undefined();
            done();
          });
      });
    });
  });
});
