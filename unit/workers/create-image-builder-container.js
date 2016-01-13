/**
 * @module unit/workers/create-image-builder-container
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')
var async = require('async')
var sinon = require('sinon')
var Docker = require('models/apis/docker')
var Context = require('models/mongo/context')
var ContextVersion = require('models/mongo/context-version')
var messenger = require('socket/messenger')

var StartImageBuildContainerWorker = require('workers/create-image-builder-container')

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('CreateImageBuilderContainerWorker: ' + moduleName, function () {
  var ctx

  beforeEach(function (done) {
    ctx = {}
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
        cb()
      },
      handleRecovery: sinon.stub().yieldsAsync()
    }
    ctx.mockContext = {
      '_id': '55d3ef733e1b620e00eb6242',
      name: 'name12',
      owner: {
        github: '2335750'
      },
      createdBy: {
        github: '146592'
      }
    }
    ctx.container = {
      id: 'hello'
    }
    ctx.mockUser = {
      accounts: {
        github: {
          id: 'asdasdasd',
          displayName: 'asdasqwqwerqweqwe',
          username: 'sdasdas'
        }
      }
    }
    ctx.dockerTag = 'asdasdasdasd'
    ctx.data = {
      manualBuild: {
        someStuff: 'I forgot what this looks like'
      },
      sessionUserGithubId: ctx.mockUser.accounts.github.id,
      contextId: '55d3ef733e1b620e00eb6242',
      contextVersionId: '55d3ef733e1b620e00eb6292',
      noCache: false,
      tid: '123413423423423423423423'
    }
    sinon.spy(Docker, 'getDockerTag')
    done()
  })
  afterEach(function (done) {
    Docker.getDockerTag.restore()
    done()
  })

  describe('Full run', function () {
    describe('success', function () {
      beforeEach(function (done) {
        // initialize instance w/ props, don't actually run protected methods
        ctx.worker = new StartImageBuildContainerWorker(ctx.data)
        sinon.stub(Context, 'findOne').yieldsAsync(null, ctx.mockContext)
        sinon.stub(ContextVersion, 'findOne').yieldsAsync(null, ctx.mockContextVersion)
        sinon.stub(Docker.prototype, 'createImageBuilder').yieldsAsync(null, ctx.container)
        sinon.stub(ContextVersion, 'updateContainerByBuildId').yieldsAsync(null, 1)
        sinon.stub(messenger, 'emitContextVersionUpdate')
        sinon.stub(ctx.worker, '_baseWorkerFindUser', function (userGithubId, cb) {
          ctx.worker.user = ctx.mockUser
          cb(null, ctx.mockUser)
        })
        done()
      })
      afterEach(function (done) {
        Context.findOne.restore()
        ContextVersion.findOne.restore()
        Docker.prototype.createImageBuilder.restore()
        ContextVersion.updateContainerByBuildId.restore()
        messenger.emitContextVersionUpdate.restore()
        ctx.worker._baseWorkerFindUser.restore()
        done()
      })
      it('should finish by updating the contextVersion', function (done) {
        ctx.worker.handle(function (err) {
          expect(err).to.be.undefined()

          sinon.assert.calledOnce(ctx.mockContextVersion.handleRecovery)
          expect(ctx.worker.manualBuild).to.equal(ctx.data.manualBuild)
          expect(ctx.worker.sessionUser).to.equal(ctx.data.sessionUser)
          expect(ctx.worker.contextId).to.equal(ctx.data.contextId)
          expect(ctx.worker.contextVersionId).to.equal(ctx.data.contextVersionId)
          expect(ctx.worker.noCache).to.equal(ctx.data.noCache)

          expect(ctx.worker.context).to.equal(ctx.mockContext)
          expect(ctx.worker.contextVersion).to.equal(ctx.mockContextVersion)
          expect(ctx.worker.dockerContainerId).to.equal(ctx.container.id)

          expect(Context.findOne.callCount, 'findOne').to.equal(1)
          expect(Context.findOne.args[0][0], 'findOne').to.deep.equal({
            '_id': ctx.mockContext._id
          })
          expect(Context.findOne.args[0][1], 'findOne').to.be.a.function()

          // This was called at the beginning, and at the end (before the emit)
          expect(ContextVersion.findOne.callCount, 'findOne').to.equal(2)
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
          })
          expect(ContextVersion.findOne.args[0][1], 'findOne').to.be.a.function()

          expect(ContextVersion.findOne.args[1][0], 'findOne').to.deep.equal({
            '_id': ctx.mockContextVersion._id
          })

          expect(Docker.getDockerTag.callCount, 'getDockerTag').to.equal(1)
          expect(Docker.getDockerTag.args[0][0], 'getDockerTag arg0')
            .to.equal(ctx.mockContextVersion)

          expect(Docker.prototype.createImageBuilder.callCount, 'createImageBuilder').to.equal(1)

          expect(Docker.prototype.createImageBuilder.args[0][0].manualBuild)
            .to.equal(ctx.data.manualBuild)
          expect(Docker.prototype.createImageBuilder.args[0][0].sessionUser)
            .to.equal(ctx.mockUser)
          expect(Docker.prototype.createImageBuilder.args[0][0].contextVersion)
            .to.equal(ctx.mockContextVersion)
          expect(Docker.prototype.createImageBuilder.args[0][0].noCache)
            .to.equal(ctx.data.noCache)
          expect(Docker.prototype.createImageBuilder.args[0][0].tid)
            .to.equal(ctx.data.tid)
          expect(Docker.prototype.createImageBuilder.args[0][1])
            .to.be.a.function()

          expect(ContextVersion.updateContainerByBuildId.callCount, 'updateContainer').to.equal(1)
          var opts = ContextVersion.updateContainerByBuildId.args[0][0]
          expect(opts.buildId).to.equal(ctx.mockContextVersion.build._id)
          expect(opts.buildContainerId).to.equal(ctx.container.id)
          expect(opts.tag).to.equal(Docker.getDockerTag(ctx.mockContextVersion))
          expect(ContextVersion.updateContainerByBuildId.args[0][1], 'updateContainer')
            .to.be.a.function()
          expect(
            messenger.emitContextVersionUpdate.callCount,
            'emitContextVersionUpdate'
          ).to.equal(1)
          expect(
            messenger.emitContextVersionUpdate.args[0][0],
            'emitContextVersionUpdate arg0'
          ).to.equal(ctx.mockContextVersion)
          expect(
            messenger.emitContextVersionUpdate.args[0][1],
            'emitContextVersionUpdate arg0'
          ).to.equal('build_started')
          done()
        })
      })
    }) // end 'success'

    describe('failure', function () {
      beforeEach(function (done) {
        // initialize instance w/ props, don't actually run protected methods
        ctx.worker = new StartImageBuildContainerWorker(ctx.data)
        sinon.stub(Context, 'findOne').yieldsAsync(null, ctx.mockContext)
        sinon.stub(ContextVersion, 'findOne').yieldsAsync(null, ctx.mockContextVersion)
        // FAILING HERE
        sinon.stub(Docker.prototype, 'createImageBuilder').yieldsAsync(new Error('error'))

        sinon.stub(ContextVersion, 'updateContainerByBuildId').yieldsAsync()

        sinon.stub(ctx.worker, '_baseWorkerFindUser', function (userGithubId, cb) {
          ctx.worker.user = ctx.mockUser
          cb(null, ctx.mockUser)
        })
        sinon.stub(ContextVersion, 'updateBuildErrorByBuildId').yieldsAsync()
        done()
      })
      afterEach(function (done) {
        Context.findOne.restore()
        ContextVersion.findOne.restore()
        Docker.prototype.createImageBuilder.restore()
        ContextVersion.updateContainerByBuildId.restore()
        ctx.worker._baseWorkerFindUser.restore()
        ContextVersion.updateBuildErrorByBuildId.restore()
        done()
      })
      it('should error', function (done) {
        ctx.worker.handle(function (err) {
          expect(err).to.be.undefined()
          expect(ContextVersion.findOne.callCount, 'findOne').to.equal(1)
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
          })
          expect(ContextVersion.findOne.args[0][1], 'findOne').to.be.a.function()

          // Because of retry logic, this is WORKER_START_CONTAINER_NUMBER_RETRY_ATTEMPTS
          expect(Docker.prototype.createImageBuilder.callCount, 'createImageBuilder').to
            .equal(process.env.WORKER_CREATE_CONTAINER_NUMBER_RETRY_ATTEMPTS)
          expect(ContextVersion.updateBuildErrorByBuildId.callCount, 'updateBuildError')
            .to.equal(1)
          expect(ContextVersion.updateBuildErrorByBuildId.args[0][0], 'updateBuildError')
            .to.equal(ctx.mockContextVersion.build._id)

          done()
        })
      })
    }) // end 'failure'
  }) // end 'Full run'

  describe('independent tests', function () {
    beforeEach(function (done) {
      // initialize instance w/ props, don't actually run protected methods
      ctx.worker = new StartImageBuildContainerWorker(ctx.data)

      sinon.stub(async, 'series', function () {
        async.series.restore()
        done()
      })
      ctx.worker.handle(function () {})
    })

    describe('_findContext', function () {
      describe('basic', function () {
        beforeEach(function (done) {
          sinon.stub(Context, 'findOne').yieldsAsync(null, ctx.mockContext)
          done()
        })
        afterEach(function (done) {
          Context.findOne.restore()
          done()
        })
        it('should query mongo for context', function (done) {
          ctx.worker._findContext(function (err) {
            expect(err).to.be.undefined()
            expect(Context.findOne.callCount).to.equal(1)
            expect(Context.findOne.args[0][0]).to.deep.equal({
              '_id': ctx.mockContext._id
            })
            expect(Context.findOne.args[0][1]).to.be.a.function()
            done()
          })
        })
        it('should callback successfully if context', function (done) {
          ctx.worker._findContext(function (err) {
            expect(err).to.be.undefined()
            expect(ctx.worker.context).to.equal(ctx.mockContext)
            done()
          })
        })
      })

      describe('not found', function () {
        beforeEach(function (done) {
          sinon.stub(Context, 'findOne').yieldsAsync(null, null)
          done()
        })
        afterEach(function (done) {
          Context.findOne.restore()
          done()
        })
        it('should callback error if context not found', function (done) {
          ctx.worker._findContext(function (err) {
            expect(err.message).to.equal('context not found')
            expect(ctx.worker.context).to.be.undefined()
            done()
          })
        })
      })

      describe('mongo error', function () {
        beforeEach(function (done) {
          sinon.stub(Context, 'findOne').yieldsAsync(new Error('mongoose error'), null)
          done()
        })
        afterEach(function (done) {
          Context.findOne.restore()
          done()
        })
        it('should callback error if mongo error', function (done) {
          ctx.worker._findContext(function (err) {
            expect(err.message).to.equal('mongoose error')
            expect(ctx.worker.context).to.be.undefined()
            done()
          })
        })
      })
    }) // end '_findContext'

    describe('_populateInfraCodeVersion', function () {
      describe('basic', function () {
        beforeEach(function (done) {
          ctx.worker.contextVersion = ctx.mockContextVersion
          sinon.stub(ctx.mockContextVersion, 'populate').yieldsAsync(null)
          done()
        })
        afterEach(function (done) {
          ctx.mockContextVersion.populate.restore()
          done()
        })
        it('should call the populate method on the cv', function (done) {
          ctx.worker._populateInfraCodeVersion(function (err) {
            expect(err).to.be.null()
            expect(ctx.mockContextVersion.populate.callCount).to.equal(1)
            expect(ctx.mockContextVersion.populate.args[0][0]).to.deep.equal('infraCodeVersion')
            expect(ctx.mockContextVersion.populate.args[0][1]).to.be.a.function()
            done()
          })
        })
      })

      describe('mongo error', function () {
        beforeEach(function (done) {
          ctx.worker.contextVersion = ctx.mockContextVersion
          sinon.stub(ctx.mockContextVersion, 'populate').yieldsAsync(new Error('oh geez!'))
          done()
        })
        afterEach(function (done) {
          ctx.mockContextVersion.populate.restore()
          done()
        })
        it('should callback error if mongo error', function (done) {
          ctx.worker._populateInfraCodeVersion(function (err) {
            expect(err.message).to.equal('oh geez!')
            done()
          })
        })
      })
    }) // end '_populateInfraCodeVersion'

    describe('_createImageBuilder', function () {
      beforeEach(function (done) {
        // normally set by _findContextVersion
        ctx.worker.contextVersion = ctx.mockContextVersion
        done()
      })

      describe('success', function () {
        beforeEach(function (done) {
          sinon.stub(Docker.prototype, 'createImageBuilder').yieldsAsync(null, ctx.container)
          done()
        })
        afterEach(function (done) {
          Docker.prototype.createImageBuilder.restore()
          done()
        })
        it('should callback successfully if container start', function (done) {
          ctx.worker._createImageBuilder(function (err) {
            expect(err).to.be.null()
            expect(ctx.worker.dockerContainerId).to.equal(ctx.container.id)

            expect(Docker.prototype.createImageBuilder.callCount, 'createImageBuilder').to.equal(1)

            expect(Docker.prototype.createImageBuilder.args[0][0].manualBuild)
              .to.equal(ctx.data.manualBuild)
            expect(Docker.prototype.createImageBuilder.args[0][0].sessionUser)
              .to.equal(ctx.data.sessionUser)
            expect(Docker.prototype.createImageBuilder.args[0][0].contextVersion)
              .to.equal(ctx.mockContextVersion)
            expect(Docker.prototype.createImageBuilder.args[0][0].noCache)
              .to.equal(ctx.data.noCache)
            expect(Docker.prototype.createImageBuilder.args[0][0].tid)
              .to.equal(ctx.data.tid)
            expect(Docker.prototype.createImageBuilder.args[0][1])
              .to.be.a.function()
            done()
          })
        })
      })
      describe('failure n times', function () {
        beforeEach(function (done) {
          sinon.stub(Docker.prototype, 'createImageBuilder').yieldsAsync(new Error('Docker error'))
          done()
        })
        afterEach(function (done) {
          Docker.prototype.createImageBuilder.restore()
          done()
        })
        it('should attempt to start container n times', function (done) {
          ctx.worker._createImageBuilder(function (err) {
            expect(err.message).to.equal('Docker error')
            expect(Docker.prototype.createImageBuilder.callCount)
              .to.equal(process.env.WORKER_CREATE_CONTAINER_NUMBER_RETRY_ATTEMPTS)
            done()
          })
        })
      })
    }) // end '_createImageBuilder'

    describe('_updateContextVersionWithContainer', function () {
      describe('basic', function () {
        beforeEach(function (done) {
          // normally set by _findContextVersion
          ctx.worker.contextVersion = ctx.mockContextVersion
          ctx.worker.dockerContainerId = ctx.container.id
          done()
        })
        beforeEach(function (done) {
          sinon.stub(ContextVersion, 'updateContainerByBuildId').yieldsAsync(null, 1)
          done()
        })
        afterEach(function (done) {
          ContextVersion.updateContainerByBuildId.restore()
          done()
        })
        it('should query mongo for contextVersion', function (done) {
          ctx.worker._updateContextVersionWithContainer(function (err) {
            expect(err).to.be.undefined()
            expect(ContextVersion.updateContainerByBuildId.callCount).to.equal(1)
            var opts = ContextVersion.updateContainerByBuildId.args[0][0]
            expect(opts.buildId).to.equal(ctx.mockContextVersion.build._id)
            expect(opts.buildContainerId).to.equal(ctx.container.id)
            expect(opts.tag).to.equal(Docker.getDockerTag(ctx.mockContextVersion))
            expect(ContextVersion.updateContainerByBuildId.args[0][1]).to.be.a.function()
            done()
          })
        })
      })
    }) // end '_updateContextVersionWithContainer'

    describe('_onError', function () {
      beforeEach(function (done) {
        ctx.worker.contextVersion = ctx.mockContextVersion
        done()
      })

      afterEach(function (done) {
        ContextVersion.updateBuildErrorByBuildId.restore()
        done()
      })

      describe('basics', function () {
        beforeEach(function (done) {
          sinon.stub(ContextVersion, 'updateBuildErrorByBuildId').yieldsAsync(null)
          done()
        })

        it('should trigger only the updateBuildError', function (done) {
          ctx.worker._onError(new Error('hello'), function () {
            expect(ContextVersion.updateBuildErrorByBuildId.callCount).to.equal(1)
            expect(ContextVersion.updateBuildErrorByBuildId.args[0][0]).to.equal(
              ctx.mockContextVersion.build._id
            )
            done()
          })
        })
        it('should trigger the delete host and updateBuildError', function (done) {
          ctx.worker._onError(new Error('hello'), function () {
            expect(ContextVersion.updateBuildErrorByBuildId.callCount).to.equal(1)
            expect(ContextVersion.updateBuildErrorByBuildId.args[0][0]).to.equal(
              ctx.mockContextVersion.build._id
            )
            done()
          })
        })
      })
    }) // end '_onError'

    describe('_updateCvOnError', function () {
      var buildId = 'some-build-id'

      beforeEach(function (done) {
        ctx.worker = new StartImageBuildContainerWorker(ctx.data)
        ctx.worker.contextVersion = { build: { _id: buildId } }
        sinon.stub(ContextVersion, 'updateBuildErrorByBuildId').yieldsAsync()
        done()
      })

      afterEach(function (done) {
        ContextVersion.updateBuildErrorByBuildId.restore()
        done()
      })

      it('should callback with the original error', function (done) {
        var originalError = new Error('this way comes')
        ctx.worker._updateCvOnError(originalError, function (err) {
          expect(err).to.equal(originalError)
          done()
        })
      })
    }) // end '_updateCvOnError'
  }) // end 'independent tests'
}) // end 'CreateImageBuilderContainerWorker'
