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

var Build = require('models/mongo/build');
var ContextVersion = require('models/mongo/context-version');
var Instance = require('models/mongo/instance');
var User = require('models/mongo/user');
var Docker = require('models/apis/docker');
var Sauron = require('models/apis/sauron.js');
var messenger = require('socket/messenger.js');
var keypather = require('keypather')();
var rabbitMQ = require('models/rabbitmq');

var OnImageBuilderContainerDie = require('workers/on-image-builder-container-die');

var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;
var expectErr = function (expectedErr, done) {
  return function (err) {
    expect(err).to.equal(expectedErr);
    done();
  };
};

var path = require('path');
var moduleName = path.relative(process.cwd(), __filename);

describe('OnImageBuilderContainerDie: '+moduleName, function () {
  var ctx;

  beforeEach(function (done) {
    ctx = {};
    ctx.data = keypather.expand({
      from: '34565762',
      host: '5476',
      id: '3225',
      time: '234234',
      uuid: '12343',
      dockerHost: '0.0.0.0',
      'inspectData.Name': '/123456789012345678901111',
      'inspectData.Config.Labels.sessionUserGithubId': 1
    });
    ctx.mockContextVersion = {
      _id: 123,
      toJSON: function () { return {}; }
    };
    sinon.stub(async, 'series', noop);
    ctx.worker = new OnImageBuilderContainerDie(ctx.data);

    // would normally be assigned from _baseWorkerFindContextVersion
    ctx.worker.contextVersions = [ctx.mockContextVersion];
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
        sinon.stub(Docker.prototype, 'getBuildInfo').yieldsAsync(null, {});
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
        sinon.stub(Docker.prototype, 'getBuildInfo').yieldsAsync(null, { failed: true });
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
        sinon.stub(Docker.prototype, 'getBuildInfo').yieldsAsync(new Error('docker error'));
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
      ctx.worker.contextVersions = [ctx.mockContextVersion];
      sinon.stub(ContextVersion, 'updateBuildErrorByContainer').yieldsAsync(null, [ctx.mockContextVersion]);
      sinon.stub(Build, 'updateFailedByContextVersionIds').yieldsAsync();
      done();
    });
    afterEach(function (done) {
      ContextVersion.updateBuildErrorByContainer.restore();
      Build.updateFailedByContextVersionIds.restore();
      done();
    });
    it('it should handle errored build', function (done) {
      ctx.worker._handleBuildError({}, function () {
        sinon.assert.calledWith(ContextVersion.updateBuildErrorByContainer, ctx.data.id);
        sinon.assert.calledWith(Build.updateFailedByContextVersionIds, [ctx.mockContextVersion._id]);
        done();
      });
    });
  });

  describe('_handleBuildSuccess', function () {
    beforeEach(function (done) {
      ctx.versionIds = [
        '123456789012345678901234',
        '1111111111111111111111111'
      ];
      ctx.mockInstances = [{
        _id: '2222222222222222222222222',
        build: '1222222222222222222222222'
      }, {
        _id: '3333333333333333333333333',
        build: '1333333333333333333333333'
      }];
      ctx.worker.ownerUsername = 'runnable';
      sinon.stub(Build, 'updateCompletedByContextVersionIds');
      sinon.stub(Instance, 'emitInstanceUpdates');
      sinon.stub(rabbitMQ, 'createInstanceContainer');
      done();
    });
    afterEach(function (done) {
      Build.updateCompletedByContextVersionIds.restore();
      Instance.emitInstanceUpdates.restore();
      rabbitMQ.createInstanceContainer.restore();
      done();
    });
    describe('success', function() {
      beforeEach(function (done) {
        Build.updateCompletedByContextVersionIds.yieldsAsync();
        Instance.emitInstanceUpdates.yieldsAsync(null, ctx.mockInstances);
        done();
      });

      it('should create create-instance-container jobs', function(done) {
        ctx.worker._handleBuildSuccess(ctx.versionIds, function (err) {
          if (err) { return done(err); }
          sinon.assert.calledWith(
            Build.updateCompletedByContextVersionIds,
            ctx.versionIds,
            sinon.match.func
          );
          sinon.assert.calledWith(
            Instance.emitInstanceUpdates,
            { 'contextVersion._id': {$in: ctx.versionIds} },
            sinon.match.func
          );
          ctx.mockInstances.forEach(function (instance) {
            sinon.assert.calledWith(
              rabbitMQ.createInstanceContainer,
              {
                instanceId: instance._id,
                buildId: instance.build,
                ownerUsername: ctx.worker.ownerUsername
              }
            );
          });
          done();
        });
      });
    });
    describe('error', function () {
      beforeEach(function (done) {
        ctx.err = new Error('boom');
        done();
      });
      describe('updateCompletedByContextVersionIds errors', function () {
        beforeEach(function (done) {
          Build.updateCompletedByContextVersionIds.yieldsAsync(ctx.err);
          done();
        });
        it('should callback the error', function(done) {
          ctx.worker._handleBuildSuccess(ctx.versionIds, expectErr(ctx.err, done));
        });
      });
      describe('emitInstanceUpdates errors', function () {
        beforeEach(function (done) {
          Build.updateCompletedByContextVersionIds.yieldsAsync();
          Instance.emitInstanceUpdates.yieldsAsync(ctx.err);
          done();
        });
        it('should callback the error', function(done) {
          ctx.worker._handleBuildSuccess(ctx.versionIds, expectErr(ctx.err, done));
        });
      });
    });
  });

  describe('_handleBuildComplete', function () {
    beforeEach(function (done) {
      ctx.worker.contextVersions = [ctx.mockContextVersion];
      ctx.buildInfo = {};
      sinon.stub(ContextVersion, 'updateBuildCompletedByContainer')
        .yieldsAsync(null, [ctx.mockContextVersion]);
      sinon.stub(ctx.worker, '_handleBuildSuccess').yieldsAsync();
      done();
    });
    afterEach(function (done) {
      ContextVersion.updateBuildCompletedByContainer.restore();
      ctx.worker._handleBuildSuccess.restore();
      done();
    });
    it('it should handle successful build', function (done) {
      ctx.worker._handleBuildComplete(ctx.buildInfo, function () {
        sinon.assert.calledWith(
          ContextVersion.updateBuildCompletedByContainer,
          ctx.data.id,
          ctx.buildInfo
        );
        sinon.assert.calledWith(
          ctx.worker._handleBuildSuccess,
          [ctx.mockContextVersion._id]
        );
        done();
      });
    });
    describe('build failed w/ exit code', function () {
      beforeEach(function (done) {
        sinon.stub(Build, 'updateFailedByContextVersionIds').yieldsAsync();
        ctx.buildInfo.failed = true;
        done();
      });
      afterEach(function (done) {
        Build.updateFailedByContextVersionIds.restore();
        done();
      });
      it('it should handle failed build', function (done) {
        ctx.worker._handleBuildComplete(ctx.buildInfo, function () {
          sinon.assert.calledWith(
            ContextVersion.updateBuildCompletedByContainer,
            ctx.data.id,
            ctx.buildInfo
          );
          sinon.assert.calledWith(
            Build.updateFailedByContextVersionIds,
            [ctx.mockContextVersion._id]
          );
          done();
        });
      });
    });
  });

  describe('_emitInstanceUpdateEvents', function () {
    beforeEach(function (done) {
      ctx.mockUser = {};
      ctx.mockInstances = [{}, {}, {}];
      sinon.stub(User, 'findByGithubId').yieldsAsync(null, ctx.mockUser);
      sinon.stub(Instance, 'findAndPopulate').yieldsAsync(null, ctx.mockInstances);
      sinon.stub(messenger, 'emitInstanceUpdate');
      done();
    });
    afterEach(function (done) {
      User.findByGithubId.restore();
      Instance.findAndPopulate.restore();
      messenger.emitInstanceUpdate.restore();
      done();
    });

    it('should emit instance update events', function (done) {
      ctx.worker._emitInstanceUpdateEvents(function (err) {
        if (err) { return done(err); }
        sinon.assert.calledWith(User.findByGithubId, ctx.data.inspectData.Config.Labels.sessionUserGithubId);
        sinon.assert.calledWith(Instance.findAndPopulate, ctx.mockUser);
        var query = Instance.findAndPopulate.firstCall.args[1];
        expect(query['contextVersion.build._id'].toString())
          .to.deep.equal(ctx.data.inspectData.Name.slice(1));
        ctx.mockInstances.forEach(function (mockInstance, i) {
          expect(messenger.emitInstanceUpdate.args[i][0]).to.equal(mockInstance);
        });
        done();
      });
    });
  });

  describe('_deallocImageBuilderNetwork', function () {
    beforeEach(function (done) {
      sinon.stub(Sauron, 'deleteHostFromContextVersion').yieldsAsync();
      done();
    });
    afterEach(function (done) {
      Sauron.deleteHostFromContextVersion.restore();
      done();
    });
    it('should delete host from context version', function (done) {
      ctx.worker._deallocImageBuilderNetwork(function (err) {
        if (err) { return done(err); }
        sinon.assert.calledWith(
          Sauron.deleteHostFromContextVersion,
          ctx.worker.contextVersions[0],
          sinon.match.func
        );
        done();
      });
    });
  });
});
