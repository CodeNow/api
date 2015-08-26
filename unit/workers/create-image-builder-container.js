/**
 * @module unit/workers/create-image-builder-container
 */
'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();

var Code = require('code');
var async = require('async');
var sinon = require('sinon');
var keypather = require('keypather')();
var Docker = require('models/apis/docker');
var Context = require('models/mongo/context');
var ContextVersion = require('models/mongo/context-version');
var Sauron = require('models/apis/sauron');
var messenger = require('socket/messenger');

var StartImageBuildContainerWorker = require('workers/create-image-builder-container');

var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;


describe('CreateImageBuilderContainerWorker', function () {
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
      },
      populate: function (id, cb) {
        cb();
      }
    };
    ctx.mockContext = {
      '_id': '55d3ef733e1b620e00eb6242',
      name: 'name12',
      owner: {
        github: '2335750'
      },
      createdBy: {
        github: '146592'
      }
    };
    ctx.sauronResult = {
      hostIp: '1',
      networkIp: '2'
    };
    ctx.container = {
      id: 'hello'
    };
    ctx.dockerTag = 'asdasdasdasd';
    ctx.data = {
      manualBuild: {
        someStuff: 'I forgot what this looks like'
      },
      sessionUser: {
        accounts: {
          github: {
            id: 'asdasdasd',
            displayName: 'asdasqwqwerqweqwe',
            username: 'sdasdas'
          }
        }
      },
      contextId: '55d3ef733e1b620e00eb6242',
      contextVersionId: '55d3ef733e1b620e00eb6292',
      dockerHost: 'localhost:4243',
      noCache: false,
      tid: '123413423423423423423423'
    };
    done();
  });

  describe('Full run', function () {
    describe('success', function () {
      beforeEach(function (done) {
        // initialize instance w/ props, don't actually run protected methods
        ctx.worker = new StartImageBuildContainerWorker();
        sinon.stub(Context, 'findOne').yieldsAsync(null, ctx.mockContext);
        sinon.stub(Sauron.prototype, 'findOrCreateHostForContext', function (context, cb) {
          cb(null, ctx.sauronResult);
        });
        sinon.stub(ContextVersion, 'findOne').yieldsAsync(null, ctx.mockContextVersion);

        sinon.stub(Docker.prototype, 'getDockerTag').returns(ctx.dockerTag);
        sinon.stub(Docker.prototype, 'createImageBuilder').yieldsAsync(null, ctx.container);

        sinon.stub(ContextVersion, 'updateContainerByBuildId').yieldsAsync(null, 1);

        sinon.stub(messenger, 'emitContextVersionUpdate');
        done();
      });
      afterEach(function (done) {
        Context.findOne.restore();
        Sauron.prototype.findOrCreateHostForContext.restore();
        ContextVersion.findOne.restore();
        Docker.prototype.getDockerTag.restore();
        Docker.prototype.createImageBuilder.restore();
        ContextVersion.updateContainerByBuildId.restore();
        messenger.emitContextVersionUpdate.restore();
        done();
      });
      it('should finish by updating the contextVersion', function (done) {
        ctx.worker.handle(ctx.data, function (err) {
          expect(err).to.be.undefined();

          expect(ctx.worker.manualBuild).to.equal(ctx.data.manualBuild);
          expect(ctx.worker.sessionUser).to.equal(ctx.data.sessionUser);
          expect(ctx.worker.contextId).to.equal(ctx.data.contextId);
          expect(ctx.worker.contextVersionId).to.equal(ctx.data.contextVersionId);
          expect(ctx.worker.dockerHost).to.equal(ctx.data.dockerHost);
          expect(ctx.worker.noCache).to.equal(ctx.data.noCache);

          expect(ctx.worker.network).to.equal(ctx.sauronResult);
          expect(ctx.worker.context).to.equal(ctx.mockContext);
          expect(ctx.worker.contextVersion).to.equal(ctx.mockContextVersion);
          expect(ctx.worker.dockerContainerId).to.equal(ctx.container.id);


          expect(Context.findOne.callCount, 'findOne').to.equal(1);
          expect(Context.findOne.args[0][0], 'findOne').to.deep.equal({
            '_id': ctx.mockContext._id
          });
          expect(Context.findOne.args[0][1], 'findOne').to.be.a.function();

          expect(
            Sauron.prototype.findOrCreateHostForContext.callCount,
            'findOrCreateHostForContext'
          ).to.equal(1);
          expect(
            Sauron.prototype.findOrCreateHostForContext.args[0][0],
            'findOrCreateHostForContext'
          ).to.deep.equal(ctx.mockContext);

          // This was called at the beginning, and at the end (before the emit)
          expect(ContextVersion.findOne.callCount, 'findOne').to.equal(2);
          expect(ContextVersion.findOne.args[0][0], 'findOne').to.deep.equal({
            '_id': ctx.mockContextVersion._id,
            'build.dockerContainer': {
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

          expect(ContextVersion.findOne.args[1][0], 'findOne').to.deep.equal({
            '_id': ctx.mockContextVersion._id,
            'build.dockerContainer': {
              $exists: true
            },
            'build.started': {
              $exists: true
            },
            'build.finished': {
              $exists: false
            }
          });

          expect(Docker.prototype.getDockerTag.callCount, 'getDockerTag').to.equal(1);
          expect(Docker.prototype.getDockerTag.args[0][0], 'getDockerTag arg0')
              .to.equal(ctx.data.sessionUser);
          expect(Docker.prototype.getDockerTag.args[0][1], 'getDockerTag arg1')
              .to.equal(ctx.mockContextVersion);

          expect(Docker.prototype.createImageBuilder.callCount, 'createImageBuilder').to.equal(1);
          expect(Docker.prototype.createImageBuilder.args[0][0], 'createImageBuilder arg0')
              .to.equal(ctx.data.manualBuild);
          expect(Docker.prototype.createImageBuilder.args[0][1], 'createImageBuilder arg1')
              .to.equal(ctx.data.sessionUser);
          expect(Docker.prototype.createImageBuilder.args[0][2], 'createImageBuilder arg2')
              .to.equal(ctx.mockContextVersion);
          expect(Docker.prototype.createImageBuilder.args[0][3], 'createImageBuilder arg3')
              .to.equal(ctx.dockerTag);
          expect(Docker.prototype.createImageBuilder.args[0][4], 'createImageBuilder arg4')
              .to.equal(ctx.sauronResult);
          expect(Docker.prototype.createImageBuilder.args[0][5], 'createImageBuilder arg5')
              .to.equal(ctx.data.noCache);
          expect(Docker.prototype.createImageBuilder.args[0][6], 'createImageBuilder arg6')
              .to.be.a.function();

          expect(ContextVersion.updateContainerByBuildId.callCount, 'updateContainer').to.equal(1);
          expect(ContextVersion.updateContainerByBuildId.args[0][0]).to.deep.equal({
            buildId: ctx.mockContextVersion.build._id,
            buildContainerId: ctx.container.id,
            tag: ctx.dockerTag,
            host: ctx.data.dockerHost,
            network: ctx.sauronResult
          });
          expect(ContextVersion.updateContainerByBuildId.args[0][1], 'updateContainer')
              .to.be.a.function();
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
          ).to.equal('build_started');
          done();
        });
      });
    });
    describe('failure', function () {
      beforeEach(function (done) {
        // initialize instance w/ props, don't actually run protected methods
        ctx.worker = new StartImageBuildContainerWorker();
        sinon.stub(Context, 'findOne').yieldsAsync(null, ctx.mockContext);
        sinon.stub(Sauron.prototype, 'findOrCreateHostForContext')
          .yieldsAsync(null, ctx.sauronResult);
        sinon.stub(ContextVersion, 'findOne').yieldsAsync(null, ctx.mockContextVersion);

        sinon.stub(Docker.prototype, 'getDockerTag').returns(ctx.dockerTag);
        // FAILING HERE
        sinon.stub(Docker.prototype, 'createImageBuilder').yieldsAsync(new Error('error'));

        sinon.stub(ContextVersion, 'updateContainerByBuildId').yieldsAsync();

        sinon.stub(Sauron.prototype, 'deleteHost').yieldsAsync(null);

        sinon.stub(ContextVersion, 'updateBuildErrorByBuildId').yieldsAsync();
        done();
      });
      afterEach(function (done) {
        Context.findOne.restore();
        Sauron.prototype.findOrCreateHostForContext.restore();
        Sauron.prototype.deleteHost.restore();
        ContextVersion.findOne.restore();
        Docker.prototype.getDockerTag.restore();
        Docker.prototype.createImageBuilder.restore();
        ContextVersion.updateContainerByBuildId.restore();
        ContextVersion.updateBuildErrorByBuildId.restore();
        done();
      });
      it('should error', function (done) {
        ctx.worker.handle(ctx.data, function (err) {
          expect(err).to.be.null();
          expect(ContextVersion.findOne.callCount, 'findOne').to.equal(1);
          expect(ContextVersion.findOne.args[0][0], 'findOne').to.deep.equal({
            '_id': ctx.mockContextVersion._id,
            'build.dockerContainer': {
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
          expect(Docker.prototype.createImageBuilder.callCount, 'createImageBuilder').to
              .equal(process.env.WORKER_CREATE_CONTAINER_NUMBER_RETRY_ATTEMPTS);
          expect(Sauron.prototype.deleteHost.callCount, 'deleteHost').to.equal(1);
          expect(Sauron.prototype.deleteHost.args[0][0], 'deleteHost')
              .to.equal(ctx.sauronResult.networkIp);
          expect(Sauron.prototype.deleteHost.args[0][1], 'deleteHost')
              .to.equal(ctx.sauronResult.hostIp);
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
      ctx.worker = new StartImageBuildContainerWorker();

      sinon.stub(async, 'series', function () {
        async.series.restore();
        done();
      });
      ctx.worker.handle(ctx.data, function () {});
    });
    describe('_findContext', function () {
      describe('basic', function () {
        beforeEach(function (done) {
          sinon.stub(Context, 'findOne').yieldsAsync(null, ctx.mockContext);
          done();
        });
        afterEach(function (done) {
          Context.findOne.restore();
          done();
        });
        it('should query mongo for context', function (done) {
          ctx.worker._findContext(function (err) {
            expect(err).to.be.undefined();
            expect(Context.findOne.callCount).to.equal(1);
            expect(Context.findOne.args[0][0]).to.deep.equal({
              '_id': ctx.mockContext._id
            });
            expect(Context.findOne.args[0][1]).to.be.a.function();
            done();
          });
        });
        it('should callback successfully if context', function (done) {
          ctx.worker._findContext(function (err) {
            expect(err).to.be.undefined();
            expect(ctx.worker.context).to.equal(ctx.mockContext);
            done();
          });
        });
      });


      describe('not found', function () {
        beforeEach(function (done) {
          sinon.stub(Context, 'findOne').yieldsAsync(null, null);
          done();
        });
        afterEach(function (done) {
          Context.findOne.restore();
          done();
        });
        it('should callback error if context not found', function (done) {
          ctx.worker._findContext(function (err) {
            expect(err.message).to.equal('context not found');
            expect(ctx.worker.context).to.be.undefined();
            done();
          });
        });
      });

      describe('mongo error', function () {
        beforeEach(function (done) {
          sinon.stub(Context, 'findOne').yieldsAsync(new Error('mongoose error'), null);
          done();
        });
        afterEach(function (done) {
          Context.findOne.restore();
          done();
        });
        it('should callback error if mongo error', function (done) {
          ctx.worker._findContext(function (err) {
            expect(err.message).to.equal('mongoose error');
            expect(ctx.worker.context).to.be.undefined();
            done();
          });
        });
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
          ctx.worker._findContextVersion(function (err) {
            expect(err).to.be.null();
            expect(ContextVersion.findOne.callCount).to.equal(1);
            expect(ContextVersion.findOne.args[0][0], 'findOne').to.deep.equal({
              '_id': ctx.mockContextVersion._id,
              'build.dockerContainer': {
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
          sinon.stub(ContextVersion, 'findOne').yieldsAsync(null, null);
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
          sinon.stub(ContextVersion, 'findOne').yieldsAsync(new Error('mongoose error'), null);
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
    describe('_populateInfraCodeVersion', function () {
      describe('basic', function () {
        beforeEach(function (done) {
          ctx.worker.contextVersion = ctx.mockContextVersion;
          sinon.stub(ctx.mockContextVersion, 'populate').yieldsAsync(null);
          done();
        });
        afterEach(function (done) {
          ctx.mockContextVersion.populate.restore();
          done();
        });
        it('should call the populate method on the cv', function (done) {
          ctx.worker._populateInfraCodeVersion(function (err) {
            expect(err).to.be.null();
            expect(ctx.mockContextVersion.populate.callCount).to.equal(1);
            expect(ctx.mockContextVersion.populate.args[0][0]).to.deep.equal('infraCodeVersion');
            expect(ctx.mockContextVersion.populate.args[0][1]).to.be.a.function();
            done();
          });
        });
      });

      describe('mongo error', function () {
        beforeEach(function (done) {
          ctx.worker.contextVersion = ctx.mockContextVersion;
          sinon.stub(ctx.mockContextVersion, 'populate').yieldsAsync(new Error('oh geez!'));
          done();
        });
        afterEach(function (done) {
          ctx.mockContextVersion.populate.restore();
          done();
        });
        it('should callback error if mongo error', function (done) {
          ctx.worker._populateInfraCodeVersion(function (err) {
            expect(err.message).to.equal('oh geez!');
            done();
          });
        });
      });
    });
    describe('_findOrCreateHost', function () {
      beforeEach(function (done) {
        // normally set by _findContext
        ctx.worker.context = ctx.mockContext;
        done();
      });

      describe('success', function () {
        beforeEach(function (done) {
          sinon.stub(Sauron.prototype, 'findOrCreateHostForContext')
            .yieldsAsync(null, ctx.sauronResult);
          done();
        });
        afterEach(function (done) {
          Sauron.prototype.findOrCreateHostForContext.restore();
          done();
        });
        it('should callback successfully if container start', function (done) {
          ctx.worker._findOrCreateHost(function (err) {
            expect(err).to.be.null();
            expect(ctx.worker.network).to.equal(ctx.sauronResult);
            expect(Sauron.prototype.findOrCreateHostForContext.callCount).to.equal(1);
            expect(Sauron.prototype.findOrCreateHostForContext.args[0][0])
              .to.deep.equal(ctx.mockContext);
            expect(
              Sauron.prototype.findOrCreateHostForContext.args[0][1],
              'findOne'
            ).to.be.a.function();
            done();
          });
        });
      });
      describe('failure n times', function () {
        beforeEach(function (done) {
          sinon.stub(Sauron.prototype, 'findOrCreateHostForContext')
            .yieldsAsync(new Error('sauron error'));
          done();
        });
        afterEach(function (done) {
          Sauron.prototype.findOrCreateHostForContext.restore();
          done();
        });
        it('should attempt to start container n times', function (done) {
          ctx.worker._findOrCreateHost(function (err) {
            expect(err.message).to.equal('sauron error');
            expect(Sauron.prototype.findOrCreateHostForContext.callCount)
              .to.equal(process.env.WORKER_SAURON_RETRY_ATTEMPTS);
            done();
          });
        });
      });
    });
    describe('_createImageBuilder', function () {
      beforeEach(function (done) {
        // normally set by _findContextVersion
        ctx.worker.contextVersion = ctx.mockContextVersion;
        ctx.worker.network = ctx.sauronResult;
        done();
      });

      describe('success', function () {
        beforeEach(function (done) {
          sinon.stub(Docker.prototype, 'getDockerTag').returns(ctx.dockerTag);
          sinon.stub(Docker.prototype, 'createImageBuilder').yieldsAsync(null, ctx.container);
          done();
        });
        afterEach(function (done) {
          Docker.prototype.getDockerTag.restore();
          Docker.prototype.createImageBuilder.restore();
          done();
        });
        it('should callback successfully if container start', function (done) {
          ctx.worker._createImageBuilder(function (err) {
            expect(err).to.be.null();
            expect(ctx.worker.dockerContainerId).to.equal(ctx.container.id);
            expect(Docker.prototype.getDockerTag.callCount, 'getDockerTag').to.equal(1);
            expect(Docker.prototype.getDockerTag.args[0][0], 'getDockerTag arg0')
              .to.equal(ctx.data.sessionUser);
            expect(Docker.prototype.getDockerTag.args[0][1], 'getDockerTag arg1')
              .to.equal(ctx.mockContextVersion);

            expect(Docker.prototype.createImageBuilder.callCount, 'createImageBuilder').to.equal(1);
            expect(Docker.prototype.createImageBuilder.args[0][0], 'createImageBuilder arg0')
              .to.equal(ctx.data.manualBuild);
            expect(Docker.prototype.createImageBuilder.args[0][1], 'createImageBuilder arg1')
              .to.equal(ctx.data.sessionUser);
            expect(Docker.prototype.createImageBuilder.args[0][2], 'createImageBuilder arg2')
              .to.equal(ctx.mockContextVersion);
            expect(Docker.prototype.createImageBuilder.args[0][3], 'createImageBuilder arg3')
              .to.equal(ctx.dockerTag);
            expect(Docker.prototype.createImageBuilder.args[0][4], 'createImageBuilder arg4')
              .to.equal(ctx.sauronResult);
            expect(Docker.prototype.createImageBuilder.args[0][5], 'createImageBuilder arg5')
              .to.equal(ctx.data.noCache);
            expect(Docker.prototype.createImageBuilder.args[0][6], 'createImageBuilder arg6')
              .to.be.a.function();
            done();
          });
        });
      });
      describe('failure n times', function () {
        beforeEach(function (done) {
          sinon.stub(Docker.prototype, 'getDockerTag').returns(ctx.dockerTag);
          sinon.stub(Docker.prototype, 'createImageBuilder').yieldsAsync(new Error('Docker error'));
          done();
        });
        afterEach(function (done) {
          Docker.prototype.getDockerTag.restore();
          Docker.prototype.createImageBuilder.restore();
          done();
        });
        it('should attempt to start container n times', function (done) {
          ctx.worker._createImageBuilder(function (err) {
            expect(err.message).to.equal('Docker error');
            expect(Docker.prototype.createImageBuilder.callCount)
              .to.equal(process.env.WORKER_CREATE_CONTAINER_NUMBER_RETRY_ATTEMPTS);
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
          ctx.worker.dockerTag = ctx.dockerTag;
          ctx.worker.network = ctx.sauronResult;
          ctx.worker.dockerContainerId = ctx.container.id;
          done();
        });
        beforeEach(function (done) {
          sinon.stub(ContextVersion, 'updateContainerByBuildId').yieldsAsync(null, 1);
          done();
        });
        afterEach(function (done) {
          ContextVersion.updateContainerByBuildId.restore();
          done();
        });
        it('should query mongo for contextVersion', function (done) {
          ctx.worker._updateContextVersionWithContainer(function (err) {
            expect(err).to.be.undefined();
            expect(ContextVersion.updateContainerByBuildId.callCount).to.equal(1);
            expect(ContextVersion.updateContainerByBuildId.args[0][0]).to.deep.equal({
              buildId: ctx.mockContextVersion.build._id,
              buildContainerId: ctx.container.id,
              tag: ctx.dockerTag,
              host: ctx.data.dockerHost,
              network: ctx.sauronResult
            });
            expect(ContextVersion.updateContainerByBuildId.args[0][1]).to.be.a.function();
            done();
          });
        });
      });
    });


    describe('_onError', function () {
      beforeEach(function (done) {
        ctx.worker.contextVersion = ctx.mockContextVersion;
        done();
      });

      afterEach(function (done) {
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


        it('Should trigger only the updateBuildError', function (done) {
          ctx.worker._onError(new Error('hello'), function () {

            expect(Sauron.prototype.deleteHost.callCount).to.equal(0);

            expect(ContextVersion.updateBuildErrorByBuildId.callCount).to.equal(1);
            expect(ContextVersion.updateBuildErrorByBuildId.args[0][0]).to.equal(
              ctx.mockContextVersion.build._id
            );
            done();
          });
        });
        it('Should trigger the delete host and updateBuildError', function (done) {
          ctx.worker.network = ctx.sauronResult;
          ctx.worker._onError(new Error('hello'), function () {

            expect(Sauron.prototype.deleteHost.callCount).to.equal(1);
            expect(Sauron.prototype.deleteHost.args[0][0]).to.equal(ctx.sauronResult.networkIp);
            expect(Sauron.prototype.deleteHost.args[0][1]).to.equal(ctx.sauronResult.hostIp);

            expect(ContextVersion.updateBuildErrorByBuildId.callCount).to.equal(1);
            expect(ContextVersion.updateBuildErrorByBuildId.args[0][0]).to.equal(
              ctx.mockContextVersion.build._id
            );
            done();
          });
        });
      });

      describe('failures with sauronHost', function () {
        beforeEach(function (done) {
          ctx.worker.network = ctx.sauronResult;
          sinon.stub(Sauron.prototype, 'deleteHost').yieldsAsync(new Error('Bryan\'s message'));

          sinon.stub(ContextVersion, 'updateBuildErrorByBuildId').yieldsAsync(null);
          done();
        });


        it('Should log an error if sauron errors on the delete', function (done) {
          ctx.worker._onError(new Error('hello'), function () {
            expect(Sauron.prototype.deleteHost.callCount)
                .to.equal(process.env.WORKER_SAURON_RETRY_ATTEMPTS);

            expect(Sauron.prototype.deleteHost.args[0][0]).to.equal(ctx.sauronResult.networkIp);
            expect(Sauron.prototype.deleteHost.args[0][1]).to.equal(ctx.sauronResult.hostIp);

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
