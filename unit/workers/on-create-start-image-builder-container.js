/**
 * @module unit/workers/start-image-builder-container
 */
'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();

var Code = require('code');
var async = require('async');
var sinon = require('sinon');
var keypather = require('keypather')();
var Docker = require('models/apis/docker');
var ContextVersion = require('models/mongo/context-version');
var Sauron = require('models/apis/sauron');

var OnCreateStartImageBuilderContainerWorker = require('workers/on-create-start-image-builder-container');

var util = require('util');
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
    ctx.data = require('../fixtures/docker-listener/build-image-container');
    ctx.labels = keypather.get(ctx.data, 'inspectData.Config.Labels');
    done();
  });

  describe('Full run', function () {
    describe('success', function () {
      beforeEach(function (done) {
        // initialize instance w/ props, don't actually run protected methods
        ctx.worker = new OnCreateStartImageBuilderContainerWorker(ctx.data);
        sinon.stub(ContextVersion, 'findOne').yieldsAsync(null, ctx.mockContextVersion);


        sinon.stub(ContextVersion, 'updateBuildErrorByBuildId').yieldsAsync();
        sinon.stub(ContextVersion, 'updateBy').yieldsAsync(null, 1);
        sinon.stub(Docker.prototype, 'startImageBuilderContainer').yieldsAsync(null);
        done();
      });
      afterEach(function (done) {
        ContextVersion.findOne.restore();
        ContextVersion.updateBuildErrorByBuildId.restore();
        ContextVersion.updateBy.restore();
        Docker.prototype.startImageBuilderContainer.restore();
        done();
      });
      it('should finish by updating the contextVersion', function (done) {
        ctx.worker.handle(function (err) {
          expect(err).to.be.undefined();
          expect(ContextVersion.findOne.callCount, 'findOne').to.equal(1);
          expect(ContextVersion.findOne.args[0][0], 'findOne').to.deep.equal({
            '_id': ctx.mockContextVersion._id,
            'build.containerStarted': {
              $exists: false
            },
            'build.started': {
              $exists: true
            },
            'build.finished': {
              $exists: false
            }
          });
          expect(ContextVersion.findOne.args[0][1], 'findOne').to.be.a.function();

          expect(ContextVersion.updateBy.callCount).to.equal(1);
          expect(ContextVersion.updateBy.args[0][0]).to.equal('build._id');
          expect(ContextVersion.updateBy.args[0][1])
              .to.deep.equal(ctx.mockContextVersion.build._id);
          expect(ContextVersion.updateBy.args[0][2]).to.be.object();
          expect(ContextVersion.updateBy.args[0][2].$set).to.be.object();
          expect(ContextVersion.updateBy.args[0][2].$set['build.containerStarted']).to.be.date();
          expect(ContextVersion.updateBy.args[0][3]).to.be.object();
          expect(ContextVersion.updateBy.args[0][3]).to.deep.equal({ multi: true });
          expect(ContextVersion.updateBy.args[0][4]).to.be.a.function();

          expect(Docker.prototype.startImageBuilderContainer.callCount, 'startImage').to.equal(1);
          expect(Docker.prototype.startImageBuilderContainer.args[0][0], 'startImage')
              .to.deep.equal(ctx.data.inspectData);

          done();
        });
      });
    });
    describe('failure', function () {
      beforeEach(function (done) {
        // initialize instance w/ props, don't actually run protected methods
        ctx.worker = new OnCreateStartImageBuilderContainerWorker(ctx.data);

        sinon.stub(ContextVersion, 'findOne').yieldsAsync(null, ctx.mockContextVersion);
        sinon.stub(Sauron.prototype, 'deleteHost').yieldsAsync(null);

        sinon.stub(ContextVersion, 'updateBuildErrorByBuildId').yieldsAsync();
        sinon.stub(ContextVersion, 'updateBy').yieldsAsync(null, 1);
        sinon.stub(
          Docker.prototype,
          'startImageBuilderContainer'
        ).yieldsAsync(new Error('asdasdasd'));
        done();
      });
      afterEach(function (done) {
        ContextVersion.findOne.restore();
        Docker.prototype.startImageBuilderContainer.restore();
        Sauron.prototype.deleteHost.restore();
        ContextVersion.updateBuildErrorByBuildId.restore();
        ContextVersion.updateBy.restore();
        done();
      });
      it('should error', function (done) {
        ctx.worker.handle(function (err) {
          expect(err).to.be.undefined();
          expect(ContextVersion.findOne.callCount, 'findOne').to.equal(1);
          expect(ContextVersion.findOne.args[0][0], 'findOne').to.deep.equal({
            '_id': ctx.mockContextVersion._id,
            'build.containerStarted': {
              $exists: false
            },
            'build.started': {
              $exists: true
            },
            'build.finished': {
              $exists: false
            }
          });
          expect(ContextVersion.findOne.args[0][1], 'findOne').to.be.a.function();


          // Because of retry logic, this is WORKER_START_CONTAINER_NUMBER_RETRY_ATTEMPTS
          expect(Docker.prototype.startImageBuilderContainer.callCount, 'startImage').to
              .equal(process.env.WORKER_START_CONTAINER_NUMBER_RETRY_ATTEMPTS);
          expect(Docker.prototype.startImageBuilderContainer.args[0][0], 'startImage').to.deep
              .equal(ctx.data.inspectData);
          expect(Sauron.prototype.deleteHost.callCount, 'deleteHost').to.equal(1);
          expect(Sauron.prototype.deleteHost.args[0][0], 'deleteHost')
              .to.equal(ctx.labels.networkIp);
          expect(Sauron.prototype.deleteHost.args[0][1], 'deleteHost')
              .to.equal(ctx.labels.hostIp);
          expect(ContextVersion.updateBuildErrorByBuildId.callCount, 'updateBuildError')
              .to.equal(1);
          expect(ContextVersion.updateBuildErrorByBuildId.args[0][0], 'updateBuildError')
              .to.equal(ctx.mockContextVersion.build._id);

          done();
        });
      });
    });
  });

  describe('independent tests', function () {
    beforeEach(function (done) {
      // initialize instance w/ props, don't actually run protected methods
      ctx.worker = new OnCreateStartImageBuilderContainerWorker(ctx.data);

      sinon.stub(async, 'series', function () {
        async.series.restore();
        done();
      });
      ctx.worker.handle(function () {
      });
    });

    describe('_findContextVersion', function () {
      describe('basic', function () {
        beforeEach(function (done) {
          sinon.stub(ContextVersion, 'findOne').yieldsAsync(null, ctx.mockContextVersion);
          done();
        });
        afterEach(function (done) {
          ContextVersion.findOne.restore();
          done();
        });
        it('should query mongo for contextVersion', function (done) {
          ctx.worker._findContextVersion({
            '_id': ctx.mockContextVersion._id,
            'build.containerStarted': {
              $exists: false
            },
            'build.started': {
              $exists: true
            },
            'build.finished': {
              $exists: false
            }
          }, function (err) {
            expect(err).to.be.null();
            expect(ContextVersion.findOne.callCount).to.equal(1);
            expect(ContextVersion.findOne.args[0][0]).to.deep.equal({
              '_id': ctx.mockContextVersion._id,
              'build.containerStarted': {
                $exists: false
              },
              'build.started': {
                $exists: true
              },
              'build.finished': {
                $exists: false
              }
            });
            expect(ContextVersion.findOne.args[0][1]).to.be.a.function();
            done();
          });
        });
        it('should callback successfully if contextVersion', function (done) {
          ctx.worker._findContextVersion({
            '_id': ctx.mockContextVersion._id,
            'build.containerStarted': {
              $exists: false
            },
            'build.started': {
              $exists: true
            },
            'build.finished': {
              $exists: false
            }
          }, function (err) {
            expect(err).to.be.null();
            expect(ctx.worker.contextVersion).to.equal(ctx.mockContextVersion);
            done();
          });
        });
      });


      describe('not found', function () {
        beforeEach(function (done) {
          sinon.stub(ContextVersion, 'findOne').yieldsAsync(null, null);
          done();
        });
        afterEach(function (done) {
          ContextVersion.findOne.restore();
          done();
        });
        it('should callback error if contextVersion not found', function (done) {
          ctx.worker._findContextVersion({
            '_id': ctx.mockContextVersion._id,
            'build.containerStarted': {
              $exists: false
            },
            'build.started': {
              $exists: true
            },
            'build.finished': {
              $exists: false
            }
          }, function (err) {
            expect(err.message).to.equal('contextVersion not found');
            expect(ctx.worker.contextVersion).to.be.undefined();
            done();
          });
        });
      });

      describe('mongo error', function () {
        beforeEach(function (done) {
          sinon.stub(ContextVersion, 'findOne').yieldsAsync(new Error('mongoose error'), null);
          done();
        });
        afterEach(function (done) {
          ContextVersion.findOne.restore();
          done();
        });
        it('should callback error if mongo error', function (done) {
          ctx.worker._findContextVersion({
            '_id': ctx.mockContextVersion._id,
            'build.containerStarted': {
              $exists: false
            },
            'build.started': {
              $exists: true
            },
            'build.finished': {
              $exists: false
            }
          }, function (err) {
            expect(err.message).to.equal('mongoose error');
            expect(ctx.worker.contextVersion).to.be.undefined();
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
          sinon.stub(Docker.prototype, 'startImageBuilderContainer').yieldsAsync(null);
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
            expect(Docker.prototype.startImageBuilderContainer.args[0][0])
                .to.deep.equal(ctx.data.inspectData);
            done();
          });
        });
      });
      describe('failure n times', function () {
        beforeEach(function (done) {
          sinon.stub(Docker.prototype, 'startImageBuilderContainer')
              .yieldsAsync(new Error('docker error'));
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
      describe('Already Started Failure', function () {
        beforeEach(function (done) {
          var error = new Error('docker error');
          error.statusCode = 304;
          sinon.stub(Docker.prototype, 'startImageBuilderContainer').yieldsAsync(error);
          done();
        });
        afterEach(function (done) {
          Docker.prototype.startImageBuilderContainer.restore();
          done();
        });
        it('should attempt to start container 1 time, then contiue', function (done) {
          ctx.worker._startContainer(function (err) {
            expect(err).to.be.null();
            expect(Docker.prototype.startImageBuilderContainer.callCount).to.equal(1);
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
          sinon.stub(ContextVersion, 'updateBy').yieldsAsync(null, 1);
          done();
        });
        afterEach(function (done) {
          ContextVersion.updateBy.restore();
          done();
        });
        it('should query mongo for contextVersion', function (done) {
          ctx.worker._updateContextVersion(function (err) {
            expect(err).to.be.undefined();
            expect(ContextVersion.updateBy.callCount).to.equal(1);
            expect(ContextVersion.updateBy.args[0][0]).to.equal('build._id');
            expect(ContextVersion.updateBy.args[0][1])
                .to.deep.equal(ctx.mockContextVersion.build._id);
            expect(ContextVersion.updateBy.args[0][2]).to.be.object();
            expect(ContextVersion.updateBy.args[0][2].$set).to.be.object();
            expect(ContextVersion.updateBy.args[0][2].$set['build.containerStarted']).to.be.date();
            expect(ContextVersion.updateBy.args[0][3]).to.be.object();
            expect(ContextVersion.updateBy.args[0][3]).to.deep.equal({ multi: true });
            expect(ContextVersion.updateBy.args[0][4]).to.be.a.function();
            done();
          });
        });
      });
    });

    describe('_onError', function () {
      beforeEach(function (done) {
        ctx.worker.contextVersion = ctx.mockContextVersion;
        sinon.spy(ctx.worker, '_updateFrontend');
        done();
      });



      afterEach(function (done) {
        ctx.worker._updateFrontend.restore();
        Sauron.prototype.deleteHost.restore();
        ContextVersion.updateBuildErrorByBuildId.restore();
        done();
      });

      describe('basics', function () {
        beforeEach(function (done) {
          sinon.stub(Sauron.prototype, 'deleteHost').yieldsAsync(null);

          sinon.stub(ContextVersion, 'updateBuildErrorByBuildId').yieldsAsync(null);
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
            done();
          });
        });
      });

      describe('failures', function () {
        beforeEach(function (done) {
          sinon.stub(Sauron.prototype, 'deleteHost').yieldsAsync(new Error('Bryan\'s message'));
          sinon.stub(
            ContextVersion,
            'updateBuildErrorByBuildId'
          ).yieldsAsync(new Error('Bryan\'s message'));
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
            done();
          });
        });
      });
    });
  });
});
