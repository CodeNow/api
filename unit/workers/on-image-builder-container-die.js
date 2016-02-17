/**
 * @module unit/workers/on-image-builder-container-die
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')
var sinon = require('sinon')
require('sinon-as-promised')(require('bluebird'))

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
      host: 'http://runnable.io',
      id: '3225',
      time: 234234,
      uuid: '12343',
      dockerHost: '0.0.0.0',
      'inspectData.Name': '/123456789012345678901111',
      'inspectData.Config.Labels.sessionUserGithubId': 1,
      'inspectData.Config.Labels.ownerUsername': 'thejsj'
    })
    ctx.mockContextVersion = {
      _id: 123,
      toJSON: function () { return {} }
    }
    ctx.worker = new OnImageBuilderContainerDie(ctx.data)

    // would normally be assigned from _baseWorkerFindContextVersion
    ctx.worker.contextVersions = [ctx.mockContextVersion]
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
          return Promise.resolve()
        })
        sinon.stub(ctx.worker, '_handleBuildComplete', function (data, cb) {
          expect(data).to.be.an.object()
          return Promise.resolve()
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
          expect(err).to.not.exist()
          expect(ctx.worker._handleBuildComplete.callCount).to.equal(1)
          expect(ctx.worker._handleBuildError.callCount).to.equal(0)
          done()
        })
      })
    })
    describe('build failure', function () {
      beforeEach(function (done) {
        sinon.stub(Docker.prototype, 'getBuildInfo').yields(null, {})
        sinon.stub(ctx.worker, '_handleBuildError', function (data, cb) {
          expect(data).to.be.an.object()
          return Promise.resolve()
        })
        sinon.stub(ctx.worker, '_handleBuildComplete', function (data, cb) {
          expect(data).to.be.an.object()
          return Promise.resolve()
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
          expect(err).to.not.exist()
          sinon.assert.calledOnce(ctx.worker._handleBuildComplete)
          sinon.assert.notCalled(ctx.worker._handleBuildError)
          done()
        })
      })
    })
    describe('fetch failure', function () {
      beforeEach(function (done) {
        sinon.stub(Docker.prototype, 'getBuildInfoAsync').rejects(new Error('docker error'))
        sinon.stub(ctx.worker, '_handleBuildError', function (data, cb) {
          expect(data).to.be.an.object()
          return Promise.resolve()
        })
        sinon.stub(ctx.worker, '_handleBuildComplete', function (data, cb) {
          expect(data).to.be.an.object()
          return Promise.resolve()
        })
        done()
      })
      afterEach(function (done) {
        Docker.prototype.getBuildInfoAsync.restore()
        ctx.worker._handleBuildError.restore()
        ctx.worker._handleBuildComplete.restore()
        done()
      })
      it('should fetch build info and update fetch failure', function (done) {
        ctx.worker._getBuildInfo(function (err) {
          expect(err).to.not.exist()
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
      sinon.stub(ContextVersion, 'updateBuildErrorByContainerAsync').resolves([ctx.mockContextVersion])
      sinon.stub(Build, 'updateFailedByContextVersionIdsAsync').resolves()
      done()
    })
    afterEach(function (done) {
      ContextVersion.updateBuildErrorByContainerAsync.restore()
      Build.updateFailedByContextVersionIdsAsync.restore()
      done()
    })
    it('it should handle errored build', function (done) {
      ctx.worker._handleBuildError({}).asCallback(function () {
        sinon.assert.calledWith(ContextVersion.updateBuildErrorByContainerAsync, ctx.data.id)
        sinon.assert.calledWith(Build.updateFailedByContextVersionIdsAsync, [ctx.mockContextVersion._id])
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
      sinon.stub(ContextVersion, 'updateBuildCompletedByContainerAsync')
      sinon.stub(Build, 'updateFailedByContextVersionIdsAsync')
      sinon.stub(Build, 'updateCompletedByContextVersionIdsAsync')
      sinon.stub(Instance, 'findByContextVersionIdsAsync').resolves([ctx.instanceStub])
      done()
    })
    afterEach(function (done) {
      ContextVersion.updateBuildCompletedByContainerAsync.restore()
      Build.updateFailedByContextVersionIdsAsync.restore()
      Build.updateCompletedByContextVersionIdsAsync.restore()
      Instance.findByContextVersionIdsAsync.restore()
      done()
    })
    describe('success', function () {
      beforeEach(function (done) {
        ContextVersion.updateBuildCompletedByContainerAsync.resolves([ctx.mockContextVersion])
        Build.updateCompletedByContextVersionIdsAsync.resolves()
        done()
      })

      it('it should handle successful build', function (done) {
        ctx.worker._handleBuildComplete(ctx.buildInfo)
          .asCallback(function () {
            sinon.assert.calledOnce(Instance.findByContextVersionIdsAsync)
            sinon.assert.calledWith(Instance.findByContextVersionIdsAsync, [ctx.mockContextVersion._id])
            sinon.assert.calledOnce(ctx.instanceStub.updateCvAsync)
            sinon.assert.calledWith(
              ContextVersion.updateBuildCompletedByContainerAsync,
              ctx.data.id,
              ctx.buildInfo
            )
            sinon.assert.calledWith(
              Build.updateCompletedByContextVersionIdsAsync,
              [ctx.mockContextVersion._id]
            )
            done()
          })
      })
    })

    describe('errors', function () {
      describe('build failed w/ exit code', function () {
        beforeEach(function (done) {
          ctx.buildInfo.failed = true
          ContextVersion.updateBuildCompletedByContainerAsync.resolves([ctx.mockContextVersion])
          done()
        })
        describe('Build.updateFailedByContextVersionIds success', function () {
          beforeEach(function (done) {
            Build.updateFailedByContextVersionIdsAsync.resolves()
            done()
          })
          it('it should handle failed build', function (done) {
            ctx.worker._handleBuildComplete(ctx.buildInfo)
              .asCallback(function (err) {
                if (err) { return done(err) }
                sinon.assert.calledOnce(Instance.findByContextVersionIdsAsync)
                sinon.assert.calledWith(Instance.findByContextVersionIdsAsync, [ctx.mockContextVersion._id])
                sinon.assert.calledOnce(ctx.instanceStub.updateCvAsync)
                sinon.assert.calledWith(
                  ContextVersion.updateBuildCompletedByContainerAsync,
                  ctx.data.id,
                  ctx.buildInfo
                )
                sinon.assert.calledWith(
                  Build.updateFailedByContextVersionIdsAsync,
                  [ctx.mockContextVersion._id]
                )
                done()
              })
          })
        })
        describe('Build.updateFailedByContextVersionIds error', function () {
          beforeEach(function (done) {
            ctx.err = new Error('boom0')
            Build.updateFailedByContextVersionIdsAsync.rejects(ctx.err)
            done()
          })
          it('should callback the error', function (done) {
            ctx.worker._handleBuildComplete(ctx.buildInfo)
              .asCallback(function (err) {
                sinon.assert.calledOnce(Instance.findByContextVersionIdsAsync)
                sinon.assert.calledWith(Instance.findByContextVersionIdsAsync, [ctx.mockContextVersion._id])
                sinon.assert.calledOnce(ctx.instanceStub.updateCvAsync)
                expectErr(ctx.err, done)(err)
              })
          })
        })
      })
      describe('CV.updateBuildCompletedByContainerAsync error', function () {
        beforeEach(function (done) {
          ctx.err = new Error('boom1')
          ContextVersion.updateBuildCompletedByContainerAsync.rejects(ctx.err)
          done()
        })
        it('should callback the error', function (done) {
          ctx.worker._handleBuildComplete(ctx.buildInfo)
            .asCallback(function (err) {
              sinon.assert.notCalled(Instance.findByContextVersionIdsAsync)
              sinon.assert.notCalled(ctx.instanceStub.updateCvAsync)
              expectErr(ctx.err, done)(err)
            })
        })
      })
      describe('Build.updateCompletedByContextVersionIds error', function () {
        beforeEach(function (done) {
          ctx.err = new Error('boom2')
          ContextVersion.updateBuildCompletedByContainerAsync.resolves([ctx.mockContextVersion])
          Build.updateCompletedByContextVersionIdsAsync.rejects(ctx.err)
          done()
        })
        it('should callback the error', function (done) {
          ctx.worker._handleBuildComplete(ctx.buildInfo)
            .asCallback(function (err) {
              sinon.assert.calledOnce(Instance.findByContextVersionIdsAsync)
              sinon.assert.calledWith(Instance.findByContextVersionIdsAsync, [ctx.mockContextVersion._id])
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
      sinon.stub(ContextVersion, 'findAsync').resolves([ctx.mockContextVersion])
      console.log('MOCK', ctx.mockContextVersion)
      sinon.stub(messenger, 'emitInstanceUpdate')
      sinon.stub(OnImageBuilderContainerDie.prototype, '_createContainersIfSuccessful')
      done()
    })
    afterEach(function (done) {
      User.findByGithubId.restore()
      Instance.emitInstanceUpdates.restore()
      ContextVersion.findAsync.restore()
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
            'contextVersion._id': { $in: [ctx.mockContextVersion._id] }
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
              'contextVersion._id': { $in: [ctx.mockContextVersion._id] }
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
