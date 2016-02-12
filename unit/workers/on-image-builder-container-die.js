/**
 * @module unit/workers/on-image-builder-container-die
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')
var async = require('async')
var noop = require('101/noop')
var sinon = require('sinon')

var Build = require('models/mongo/build')
var ContextVersion = require('models/mongo/context-version')
var Instance = require('models/mongo/instance')
var User = require('models/mongo/user')
var Docker = require('models/apis/docker')
var messenger = require('socket/messenger.js')
var keypather = require('keypather')()

var OnImageBuilderContainerDie = require('workers/on-image-builder-container-die')

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it
var expectErr = function (expectedErr, done) {
  return function (err) {
    expect(err).to.exist()
    expect(err.message).to.equal(expectedErr.message)
    done()
  }
}

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('OnImageBuilderContainerDie: ' + moduleName, function () {
  var ctx

  beforeEach(function (done) {
    ctx = {}
    ctx.data = keypather.expand({
      from: '34565762',
      host: '5476',
      id: '3225',
      time: '234234',
      uuid: '12343',
      dockerHost: '0.0.0.0',
      'inspectData.Name': '/123456789012345678901111',
      'inspectData.Config.Labels.sessionUserGithubId': 1
    })
    ctx.mockContextVersion = {
      _id: 123,
      toJSON: function () { return {} }
    }
    sinon.stub(async, 'series', noop)
    ctx.worker = new OnImageBuilderContainerDie(ctx.data)

    // would normally be assigned from _baseWorkerFindContextVersion
    ctx.worker.contextVersions = [ctx.mockContextVersion]
    ctx.worker.handle()
    done()
  })

  afterEach(function (done) {
    async.series.restore()
    done()
  })

  describe('_finalSeriesHandler', function () {
    it('TODO', function (done) {
      done()
    })
  })

  describe('_getBuildInfo', function () {
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(Docker.prototype, 'getBuildInfo').yieldsAsync(null, {})
        sinon.stub(ctx.worker, '_handleBuildError', function (data, cb) {
          expect(data).to.be.an.object()
          cb()
        })
        sinon.stub(ctx.worker, '_handleBuildComplete', function (data, cb) {
          expect(data).to.be.an.object()
          cb()
        })
        done()
      })
      afterEach(function (done) {
        Docker.prototype.getBuildInfo.restore()
        ctx.worker._handleBuildError.restore()
        ctx.worker._handleBuildComplete.restore()
        done()
      })
      it('should fetch build info and update success', function (done) {
        ctx.worker._getBuildInfo(function (err) {
          expect(err).to.be.undefined()
          expect(ctx.worker._handleBuildComplete.callCount).to.equal(1)
          expect(ctx.worker._handleBuildError.callCount).to.equal(0)
          done()
        })
      })
    })
    describe('build failure', function () {
      beforeEach(function (done) {
        sinon.stub(Docker.prototype, 'getBuildInfo').yieldsAsync(null, { failed: true })
        sinon.stub(ctx.worker, '_handleBuildError', function (data, cb) {
          expect(data).to.be.an.object()
          cb()
        })
        sinon.stub(ctx.worker, '_handleBuildComplete', function (data, cb) {
          expect(data).to.be.an.object()
          cb()
        })
        done()
      })
      afterEach(function (done) {
        Docker.prototype.getBuildInfo.restore()
        ctx.worker._handleBuildError.restore()
        ctx.worker._handleBuildComplete.restore()
        done()
      })
      it('should fetch build info and update build failure', function (done) {
        ctx.worker._getBuildInfo(function (err) {
          expect(err).to.be.undefined()
          expect(ctx.worker._handleBuildComplete.callCount).to.equal(1)
          expect(ctx.worker._handleBuildError.callCount).to.equal(0)
          done()
        })
      })
    })
    describe('fetch failure', function () {
      beforeEach(function (done) {
        sinon.stub(Docker.prototype, 'getBuildInfo').yieldsAsync(new Error('docker error'))
        sinon.stub(ctx.worker, '_handleBuildError', function (data, cb) {
          expect(data).to.be.an.object()
          cb()
        })
        sinon.stub(ctx.worker, '_handleBuildComplete', function (data, cb) {
          expect(data).to.be.an.object()
          cb()
        })
        done()
      })
      afterEach(function (done) {
        Docker.prototype.getBuildInfo.restore()
        ctx.worker._handleBuildError.restore()
        ctx.worker._handleBuildComplete.restore()
        done()
      })
      it('should fetch build info and update fetch failure', function (done) {
        ctx.worker._getBuildInfo(function (err) {
          expect(err).to.be.undefined()
          expect(ctx.worker._handleBuildComplete.callCount).to.equal(0)
          expect(ctx.worker._handleBuildError.callCount).to.equal(1)
          done()
        })
      })
    })
  })

  describe('_handleBuildError', function () {
    beforeEach(function (done) {
      ctx.worker.contextVersions = [ctx.mockContextVersion]
      sinon.stub(ContextVersion, 'updateBuildErrorByContainer').yieldsAsync(null, [ctx.mockContextVersion])
      sinon.stub(Build, 'updateFailedByContextVersionIds').yieldsAsync()
      done()
    })
    afterEach(function (done) {
      ContextVersion.updateBuildErrorByContainer.restore()
      Build.updateFailedByContextVersionIds.restore()
      done()
    })
    it('it should handle errored build', function (done) {
      ctx.worker._handleBuildError({}, function () {
        sinon.assert.calledWith(ContextVersion.updateBuildErrorByContainer, ctx.data.id)
        sinon.assert.calledWith(Build.updateFailedByContextVersionIds, [ctx.mockContextVersion._id])
        done()
      })
    })
  })

  describe('_handleBuildComplete', function () {
    beforeEach(function (done) {
      ctx.instanceStub = {
        updateCvAsync: sinon.stub()
      }
      ctx.worker.contextVersions = [ctx.mockContextVersion]
      ctx.buildInfo = {}
      sinon.stub(ContextVersion, 'updateBuildCompletedByContainer')
      sinon.stub(Build, 'updateFailedByContextVersionIds')
      sinon.stub(Build, 'updateCompletedByContextVersionIds')
      sinon.stub(Instance, 'find').yieldsAsync(null, [ctx.instanceStub])
      done()
    })
    afterEach(function (done) {
      ContextVersion.updateBuildCompletedByContainer.restore()
      Build.updateFailedByContextVersionIds.restore()
      Build.updateCompletedByContextVersionIds.restore()
      Instance.find.restore()
      done()
    })
    describe('success', function () {
      beforeEach(function (done) {
        ContextVersion.updateBuildCompletedByContainer
          .yieldsAsync(null, [ctx.mockContextVersion])
        Build.updateCompletedByContextVersionIds.yieldsAsync()
        done()
      })

      it('it should handle successful build', function (done) {
        ctx.worker._handleBuildComplete(ctx.buildInfo, function () {
          sinon.assert.calledOnce(Instance.find)
          sinon.assert.calledWith(Instance.find, { 'contextVersion._id': { $in: [ctx.mockContextVersion._id] } })
          sinon.assert.calledOnce(ctx.instanceStub.updateCvAsync)
          sinon.assert.calledWith(
            ContextVersion.updateBuildCompletedByContainer,
            ctx.data.id,
            ctx.buildInfo,
            sinon.match.func
          )
          sinon.assert.calledWith(
            Build.updateCompletedByContextVersionIds,
            [ctx.mockContextVersion._id],
            sinon.match.func
          )
          done()
        })
      })
    })

    describe('errors', function () {
      describe('build failed w/ exit code', function () {
        beforeEach(function (done) {
          ctx.buildInfo.failed = true
          ContextVersion.updateBuildCompletedByContainer
            .yieldsAsync(null, [ctx.mockContextVersion])
          done()
        })
        describe('Build.updateFailedByContextVersionIds success', function () {
          beforeEach(function (done) {
            Build.updateFailedByContextVersionIds.yieldsAsync()
            done()
          })
          it('it should handle failed build', function (done) {
            ctx.worker._handleBuildComplete(ctx.buildInfo, function (err) {
              if (err) { return done(err) }
              sinon.assert.calledOnce(Instance.find)
              sinon.assert.calledWith(Instance.find, { 'contextVersion._id': { $in: [ctx.mockContextVersion._id] } })
              sinon.assert.calledOnce(ctx.instanceStub.updateCvAsync)
              sinon.assert.calledWith(
                ContextVersion.updateBuildCompletedByContainer,
                ctx.data.id,
                ctx.buildInfo,
                sinon.match.func
              )
              sinon.assert.calledWith(
                Build.updateFailedByContextVersionIds,
                [ctx.mockContextVersion._id],
                sinon.match.func
              )
              done()
            })
          })
        })
        describe('Build.updateFailedByContextVersionIds error', function () {
          beforeEach(function (done) {
            ctx.err = new Error('boom0')
            Build.updateFailedByContextVersionIds.yieldsAsync(ctx.err)
            done()
          })
          it('should callback the error', function (done) {
            ctx.worker._handleBuildComplete(ctx.buildInfo, function (err) {
              sinon.assert.calledOnce(Instance.find)
              sinon.assert.calledWith(Instance.find, { 'contextVersion._id': { $in: [ctx.mockContextVersion._id] } })
              sinon.assert.calledOnce(ctx.instanceStub.updateCvAsync)
              expectErr(ctx.err, done)(err)
            })
          })
        })
      })
      describe('CV.updateBuildCompletedByContainer error', function () {
        beforeEach(function (done) {
          ctx.err = new Error('boom1')
          ContextVersion.updateBuildCompletedByContainer.yieldsAsync(ctx.err)
          done()
        })
        it('should callback the error', function (done) {
          ctx.worker._handleBuildComplete(ctx.buildInfo, function (err) {
            sinon.assert.notCalled(Instance.find)
            sinon.assert.notCalled(ctx.instanceStub.updateCvAsync)
            expectErr(ctx.err, done)(err)
          })
        })
      })
      describe('Build.updateCompletedByContextVersionIds error', function () {
        beforeEach(function (done) {
          ctx.err = new Error('boom2')
          ContextVersion.updateBuildCompletedByContainer
            .yieldsAsync(null, [ctx.mockContextVersion])
          Build.updateCompletedByContextVersionIds.yieldsAsync(ctx.err)
          done()
        })
        it('should callback the error', function (done) {
          ctx.worker._handleBuildComplete(ctx.buildInfo, function (err) {
            sinon.assert.calledOnce(Instance.find)
            sinon.assert.calledWith(Instance.find, { 'contextVersion._id': { $in: [ctx.mockContextVersion._id] } })
            sinon.assert.calledOnce(ctx.instanceStub.updateCvAsync)
            expectErr(ctx.err, done)(err)
          })
        })
      })
    })
  })

  describe('_emitInstanceUpdateEvents', function () {
    beforeEach(function (done) {
      ctx.mockUser = {}
      ctx.mockInstances = [{}, {}, {}]
      sinon.stub(User, 'findByGithubId').yieldsAsync(null, ctx.mockUser)
      sinon.stub(Instance, 'emitInstanceUpdates').yieldsAsync(null, ctx.mockInstances)
      sinon.stub(messenger, 'emitInstanceUpdate')
      sinon.stub(OnImageBuilderContainerDie.prototype, '_createContainersIfSuccessful')
      done()
    })
    afterEach(function (done) {
      User.findByGithubId.restore()
      Instance.emitInstanceUpdates.restore()
      messenger.emitInstanceUpdate.restore()
      OnImageBuilderContainerDie.prototype._createContainersIfSuccessful.restore()
      done()
    })

    it('should emit instance update events', function (done) {
      var sessionUserGithubId = keypather.get(ctx.worker.data,
        'inspectData.Config.Labels.sessionUserGithubId')
      ctx.worker._emitInstanceUpdateEvents(function (err) {
        if (err) { return done(err) }
        sinon.assert.calledWith(User.findByGithubId, ctx.data.inspectData.Config.Labels.sessionUserGithubId)
        sinon.assert.calledWith(
          Instance.emitInstanceUpdates,
          ctx.mockUser,
          {
            'contextVersion.build.dockerContainer': ctx.worker.data.id
          },
          'patch',
          sinon.match.func
        )
        sinon.assert.calledWith(
          OnImageBuilderContainerDie.prototype._createContainersIfSuccessful,
          sessionUserGithubId,
          ctx.mockInstances
        )
        done()
      })
    })

    describe('No Instances Found', function () {
      it('should throw an error and report to Rollbar if there are no instances to create containers for', function (done) {
        Instance.emitInstanceUpdates.yieldsAsync(null, [])

        ctx.worker._emitInstanceUpdateEvents(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/no.*instances.*found/i)
          sinon.assert.calledWith(User.findByGithubId, ctx.data.inspectData.Config.Labels.sessionUserGithubId)
          sinon.assert.calledWith(
            Instance.emitInstanceUpdates,
            ctx.mockUser,
            {
              'contextVersion.build.dockerContainer': ctx.worker.data.id
            },
            'patch',
            sinon.match.func
          )
          sinon.assert.notCalled(OnImageBuilderContainerDie.prototype._createContainersIfSuccessful)
          done()
        })
      })
    })
  })
})
