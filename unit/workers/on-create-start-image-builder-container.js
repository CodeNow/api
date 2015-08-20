/**
 * @module unit/workers/start-image-builder-container
 */
'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();

var Code = require('code');
var async = require('async');
var rewire = require('rewire');
var sinon = require('sinon');
var keypather = require('keypather')();

var Docker = require('models/apis/docker');
var ContextVersion = require('models/mongo/context-version');
var Sauron = require('models/apis/sauron');
var messenger = require('socket/messenger');

var mockStartImageBuilderListenerEvent = require('../fixtures/docker-listener/build-image-container');

var StartImageBuildContainerWorker = rewire('workers/on-create-start-image-builder-container');

var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;



describe('OnCreateStartImageBuilderContainerWorker', function () {
  var ctx;

  beforeEach(function (done) {
    ctx = {};

    ctx.mockContextVersion = {
      '_id': '55d3ef733e1b620e00eb6292',
      name: 'name1',
      owner: {
        github: '2335750'
      },
      createdBy: {
        github: '146592'
      },
      build: {
        _id: '23412312h3nk1lj2h3l1k2'
      }
    };
    ctx.data = mockStartImageBuilderListenerEvent;
    ctx.labels = keypather.get(ctx.data, 'inspectData.Config.Labels');
    done();
  });

  describe('Full run', function () {
    describe('success', function () {
      beforeEach(function (done) {
        // initialize instance w/ props, don't actually run protected methods
        ctx.worker = new StartImageBuildContainerWorker();
        sinon.stub(ContextVersion, 'findOne', function (data, cb) {
          cb(null, ctx.mockContextVersion);
        });
        sinon.stub(ContextVersion, 'updateContainerByBuildId', function (data, cb) {
          cb(null, ctx.mockContextVersion);
        });
        sinon.stub(Sauron.prototype, 'deleteHost', function (networkIp, hostIp, cb) {
          cb(null);
        });

        sinon.stub(ContextVersion, 'updateBuildErrorByBuildId', function (id, error, cb) {
          cb();
        });
        sinon.stub(ContextVersion, 'findOneAndUpdate', function (query, update, cb) {
          cb(null, ctx.mockContextVersion);
        });
        sinon.stub(messenger, 'emitContextVersionUpdate', function () {
        });
        sinon.stub(Docker.prototype, 'startImageBuilderContainer', function (dockerContainer, cb) {
          cb(null);
        });
        done();
      });
      afterEach(function (done) {
        ContextVersion.findOne.restore();
        ContextVersion.updateContainerByBuildId.restore();
        Docker.prototype.startImageBuilderContainer.restore();
        Sauron.prototype.deleteHost.restore();
        ContextVersion.updateBuildErrorByBuildId.restore();
        messenger.emitContextVersionUpdate.restore();
        ContextVersion.findOneAndUpdate.restore();
        done();
      });
      it('should finish by updating the contextVersion', function (done) {
        ctx.worker.handle(ctx.data, function (err) {
          expect(err).to.be.undefined();
          expect(ContextVersion.findOne.callCount, 'findOne').to.equal(1);
          expect(ContextVersion.findOne.args[0][0], 'findOne').to.deep.equal({
            '_id': ctx.mockContextVersion._id,
            'build.containerStarted': {
              $exists: false
            }
          });
          expect(ContextVersion.findOne.args[0][1], 'findOne').to.be.a.function();

          expect(ContextVersion.findOneAndUpdate.callCount, 'findOneAndUpdate').to.equal(1);
          expect(ContextVersion.findOneAndUpdate.args[0][0], 'findOneAndUpdate').to.deep.equal({
            '_id': ctx.mockContextVersion._id
          });
          expect(ContextVersion.findOneAndUpdate.args[0][1], 'findOneAndUpdate').to.be.object();
          expect(ContextVersion.findOneAndUpdate.args[0][1].$set, 'findOneAndUpdate.set').to.be.object();
          expect(
            ContextVersion.findOneAndUpdate.args[0][1].$set['build.containerStarted'],
            'findOneAndUpdate.build.containerStarted'
          ).to.be.date();
          expect(ContextVersion.findOneAndUpdate.args[0][2], 'findOneAndUpdate').to.be.a.function();

          expect(Docker.prototype.startImageBuilderContainer.callCount, 'startImage').to.equal(1);
          expect(Docker.prototype.startImageBuilderContainer.args[0][0], 'startImage').to.deep.equal(ctx.data);
          expect(ContextVersion.updateContainerByBuildId.callCount, 'updateContainer').to.equal(1);
          expect(ContextVersion.updateContainerByBuildId.args[0][0], 'updateContainer').to.deep.equal({
            buildId: ctx.mockContextVersion.build._id,
            buildContainerId: ctx.data.id,
            tag: ctx.labels.dockerTag,
            host: ctx.data.host,
            network: {
              networkIp: ctx.labels.networkIp,
              hostIp: ctx.labels.hostIp
            }
          });
          expect(ContextVersion.updateContainerByBuildId.args[0][1], 'updateContainer').to.be.a.function();

          done();
        });
      });
    });
    describe('failure', function () {
      beforeEach(function (done) {
        // initialize instance w/ props, don't actually run protected methods
        ctx.worker = new StartImageBuildContainerWorker();
        sinon.stub(ContextVersion, 'findOne', function (data, cb) {
          cb(null, ctx.mockContextVersion);
        });
        sinon.stub(ContextVersion, 'updateContainerByBuildId', function (data, cb) {
          cb(null, ctx.mockContextVersion);
        });
        sinon.stub(Sauron.prototype, 'deleteHost', function (networkIp, hostIp, cb) {
          cb(null);
        });

        sinon.stub(ContextVersion, 'updateBuildErrorByBuildId', function (id, error, cb) {
          cb();
        });
        sinon.stub(ContextVersion, 'findOneAndUpdate', function (query, update, cb) {
          cb(null, ctx.mockContextVersion);
        });
        sinon.stub(messenger, 'emitContextVersionUpdate', function () {
        });
        sinon.stub(Docker.prototype, 'startImageBuilderContainer', function (dockerContainer, cb) {
          cb(new Error('asdasdasd'));
        });
        done();
      });
      afterEach(function (done) {
        ContextVersion.findOne.restore();
        ContextVersion.updateContainerByBuildId.restore();
        Docker.prototype.startImageBuilderContainer.restore();
        Sauron.prototype.deleteHost.restore();
        ContextVersion.updateBuildErrorByBuildId.restore();
        messenger.emitContextVersionUpdate.restore();
        ContextVersion.findOneAndUpdate.restore();
        done();
      });
      it('should error', function (done) {
        ctx.worker.handle(ctx.data, function (err) {
          expect(err).to.be.undefined();
          expect(ContextVersion.findOne.callCount, 'findOne').to.equal(1);
          expect(ContextVersion.findOne.args[0][0], 'findOne').to.deep.equal({
            '_id': ctx.mockContextVersion._id,
            'build.containerStarted': {
              $exists: false
            }
          });
          expect(ContextVersion.findOne.args[0][1], 'findOne').to.be.a.function();


          // Because of retry logic, this is WORKER_START_CONTAINER_NUMBER_RETRY_ATTEMPTS
          expect(Docker.prototype.startImageBuilderContainer.callCount, 'startImage').to
              .equal(process.env.WORKER_START_CONTAINER_NUMBER_RETRY_ATTEMPTS);
          expect(Docker.prototype.startImageBuilderContainer.args[0][0], 'startImage').to.deep
              .equal(ctx.data);
          expect(ContextVersion.updateContainerByBuildId.callCount, 'updateContainerByBuildId').to.equal(1);

          expect(Sauron.prototype.deleteHost.callCount, 'deleteHost').to.equal(1);
          expect(Sauron.prototype.deleteHost.args[0][0], 'deleteHost').to.equal(ctx.labels.networkIp);
          expect(Sauron.prototype.deleteHost.args[0][1], 'deleteHost').to.equal(ctx.labels.hostIp);

          expect(ContextVersion.updateBuildErrorByBuildId.callCount, 'updateBuildError').to.equal(1);
          expect(ContextVersion.updateBuildErrorByBuildId.args[0][0], 'updateBuildError').to.equal(
            ctx.mockContextVersion.build._id
          );

          expect(messenger.emitContextVersionUpdate.callCount).to.equal(1);

          done();
        });
      });
    });
  });

  describe('independent tests', function () {
    beforeEach(function (done) {
      // initialize instance w/ props, don't actually run protected methods
      ctx.worker = new StartImageBuildContainerWorker();

      sinon.stub(async, 'series', function () {
        async.series.restore();
        done();
      });
      ctx.worker.handle(ctx.data, function () {
      });
    });

    describe('_findContextVersion', function () {
      describe('basic', function () {
        beforeEach(function (done) {
          sinon.stub(ContextVersion, 'findOne', function (data, cb) {
            cb(null, ctx.mockContextVersion);
          });
          done();
        });
        afterEach(function (done) {
          ContextVersion.findOne.restore();
          done();
        });
        it('should query mongo for contextVersion', function (done) {
          ctx.worker._findContextVersion(function (err) {
            expect(err).to.be.null();
            expect(ContextVersion.findOne.callCount).to.equal(1);
            expect(ContextVersion.findOne.args[0][0]).to.deep.equal({
              '_id': ctx.mockContextVersion._id,
              'build.containerStarted': {
                $exists: false
              }
            });
            expect(ContextVersion.findOne.args[0][1]).to.be.a.function();
            done();
          });
        });
        it('should callback successfully if contextVersion', function (done) {
          ctx.worker._findContextVersion(function (err) {
            expect(err).to.be.null();
            expect(ctx.worker.contextVersion).to.equal(ctx.mockContextVersion);
            done();
          });
        });
      });


      describe('not found', function () {
        beforeEach(function (done) {
          sinon.stub(ContextVersion, 'findOne', function (data, cb) {
            cb(null, null);
          });
          done();
        });
        afterEach(function (done) {
          ContextVersion.findOne.restore();
          done();
        });
        it('should callback error if contextVersion not found', function (done) {
          ctx.worker._findContextVersion(function (err) {
            expect(err.message).to.equal('contextVersion not found');
            expect(ctx.worker.contextVersion).to.be.undefined();
            done();
          });
        });
      });

      describe('mongo error', function () {
        beforeEach(function (done) {
          sinon.stub(ContextVersion, 'findOne', function (data, cb) {
            cb(new Error('mongoose error'), null);
          });
          done();
        });
        afterEach(function (done) {
          ContextVersion.findOne.restore();
          done();
        });
        it('should callback error if mongo error', function (done) {
          ctx.worker._findContextVersion(function (err) {
            expect(err.message).to.equal('mongoose error');
            expect(ctx.worker.contextVersion).to.be.undefined();
            done();
          });
        });
      });
    });

    describe('_updateContextVersionWithContainer', function () {
      describe('basic', function () {
        beforeEach(function (done) {
          // normally set by _findContextVersion
          ctx.worker.contextVersion = ctx.mockContextVersion;
          done();
        });
        beforeEach(function (done) {
          sinon.stub(ContextVersion, 'updateContainerByBuildId', function (data, cb) {
            cb(null, ctx.mockContextVersion);
          });
          done();
        });
        afterEach(function (done) {
          ContextVersion.updateContainerByBuildId.restore();
          done();
        });
        it('should query mongo for contextVersion', function (done) {
          ctx.worker._updateContextVersionWithContainer(function (err) {
            expect(err).to.be.null();
            expect(ContextVersion.updateContainerByBuildId.callCount).to.equal(1);
            expect(ContextVersion.updateContainerByBuildId.args[0][0]).to.deep.equal({
              buildId: ctx.mockContextVersion.build._id,
              buildContainerId: ctx.data.id,
              tag: ctx.labels.dockerTag,
              host: ctx.data.host,
              network: {
                networkIp: ctx.labels.networkIp,
                hostIp: ctx.labels.hostIp
              }
            });
            expect(ContextVersion.updateContainerByBuildId.args[0][1]).to.be.a.function();
            done();
          });
        });
      });
    });


    describe('_startContainer', function () {
      beforeEach(function (done) {
        // normally set by _findContextVersion
        ctx.worker.contextVersion = ctx.mockContextVersion;
        done();
      });

      describe('success', function () {
        beforeEach(function (done) {
          sinon.stub(Docker.prototype, 'startImageBuilderContainer', function (dockerContainer, cb) {
            cb(null);
          });
          done();
        });
        afterEach(function (done) {
          Docker.prototype.startImageBuilderContainer.restore();
          done();
        });
        it('should callback successfully if container start', function (done) {
          ctx.worker._startContainer(function (err) {
            expect(err).to.be.null();
            expect(Docker.prototype.startImageBuilderContainer.callCount).to.equal(1);
            expect(Docker.prototype.startImageBuilderContainer.args[0][0]).to.deep.equal(ctx.data);
            done();
          });
        });
      });

      describe('failure n times', function () {
        beforeEach(function (done) {
          sinon.stub(Docker.prototype, 'startImageBuilderContainer', function (dockerContainer, cb) {
            cb(new Error('docker error'));
          });
          done();
        });
        afterEach(function (done) {
          Docker.prototype.startImageBuilderContainer.restore();
          done();
        });
        it('should attempt to start container n times', function (done) {
          ctx.worker._startContainer(function (err) {
            expect(err.message).to.equal('docker error');
            expect(Docker.prototype.startImageBuilderContainer.callCount)
              .to.equal(process.env.WORKER_START_CONTAINER_NUMBER_RETRY_ATTEMPTS);
            done();
          });
        });
      });
    });

    describe('_updateContextVersion', function () {
      describe('basic', function () {
        beforeEach(function (done) {
          // normally set by _findContextVersion
          ctx.worker.contextVersion = ctx.mockContextVersion;
          done();
        });
        beforeEach(function (done) {
          sinon.stub(ContextVersion, 'findOneAndUpdate', function (query, update, cb) {
            cb(null, ctx.mockContextVersion);
          });
          done();
        });
        afterEach(function (done) {
          ContextVersion.findOneAndUpdate.restore();
          done();
        });
        it('should query mongo for contextVersion', function (done) {
          ctx.worker._updateContextVersion(function (err) {
            expect(err).to.be.null();
            expect(ContextVersion.findOneAndUpdate.callCount).to.equal(1);
            expect(ContextVersion.findOneAndUpdate.args[0][0]).to.deep.equal({
              '_id': ctx.mockContextVersion._id
            });
            expect(ContextVersion.findOneAndUpdate.args[0][1]).to.be.object();
            expect(ContextVersion.findOneAndUpdate.args[0][1].$set).to.be.object();
            expect(ContextVersion.findOneAndUpdate.args[0][1].$set['build.containerStarted']).to.be.date();
            expect(ContextVersion.findOneAndUpdate.args[0][2]).to.be.a.function();
            done();
          });
        });
      });
    });

    describe('_onError', function () {
      beforeEach(function (done) {
        ctx.worker.contextVersion = ctx.mockContextVersion;
        sinon.stub(messenger, 'emitContextVersionUpdate', function () {});
        sinon.spy(ctx.worker, '_updateFrontend');
        done();
      });



      afterEach(function (done) {
        ctx.worker._updateFrontend.restore();
        Sauron.prototype.deleteHost.restore();
        ContextVersion.updateBuildErrorByBuildId.restore();
        messenger.emitContextVersionUpdate.restore();
        done();
      });

      describe('basics', function () {
        beforeEach(function (done) {
          sinon.stub(Sauron.prototype, 'deleteHost', function (networkIp, hostIp, cb) {
            cb(null);
          });

          sinon.stub(ContextVersion, 'updateBuildErrorByBuildId', function (id, error, cb) {
            cb();
          });
          done();
        });


        it('Should trigger the delete host and updateBuildError', function (done) {
          ctx.worker._onError(new Error('hello'), function () {

            expect(Sauron.prototype.deleteHost.callCount).to.equal(1);
            expect(Sauron.prototype.deleteHost.args[0][0]).to.equal(ctx.labels.networkIp);
            expect(Sauron.prototype.deleteHost.args[0][1]).to.equal(ctx.labels.hostIp);

            expect(ctx.worker._updateFrontend.callCount).to.equal(1);
            expect(ContextVersion.updateBuildErrorByBuildId.callCount).to.equal(1);
            expect(ContextVersion.updateBuildErrorByBuildId.args[0][0]).to.equal(
              ctx.mockContextVersion.build._id
            );

            expect(messenger.emitContextVersionUpdate.callCount).to.equal(1);
            done();
          });
        });
      });

      describe('failures', function () {
        beforeEach(function (done) {
          sinon.stub(Sauron.prototype, 'deleteHost', function (networkIp, hostIp, cb) {
            cb(new Error('asdfasfs'));
          });
          sinon.stub(ContextVersion, 'updateBuildErrorByBuildId', function (id, error, cb) {
            cb(new Error('asdfasfs'));
          });
          done();
        });


        it('Should log an error if sauron errors on the delete', function (done) {
          ctx.worker._onError(new Error('hello'), function () {
            expect(Sauron.prototype.deleteHost.callCount).to.equal(1);
            expect(Sauron.prototype.deleteHost.args[0][0]).to.equal(ctx.labels.networkIp);
            expect(Sauron.prototype.deleteHost.args[0][1]).to.equal(ctx.labels.hostIp);

            expect(ctx.worker._updateFrontend.callCount).to.equal(1);
            expect(ContextVersion.updateBuildErrorByBuildId.callCount).to.equal(1);
            expect(ContextVersion.updateBuildErrorByBuildId.args[0][0]).to.equal(
              ctx.mockContextVersion.build._id
            );
            expect(messenger.emitContextVersionUpdate.callCount).to.equal(0);
            done();
          });
        });
      });
    });
  });
});
