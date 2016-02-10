/**
 * @module unit/workers/stop-instance-container
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')
var async = require('async')
var noop = require('101/noop')
var sinon = require('sinon')

var Docker = require('models/apis/docker')

var StopInstanceContainerWorker = require('workers/stop-instance-container')

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('StopInstanceContainerWorker: ' + moduleName, function () {
  var ctx

  beforeEach(function (done) {
    ctx = {}

    // spies
    ctx.removeStartingStoppingStatesSpy = sinon.spy(function (cb) { cb() })
    ctx.modifyContainerInspectSpy =
      sinon.spy(function (dockerContainerId, inspect, cb) {
        cb(null, ctx.mockContainer)
      })
    ctx.modifyContainerInspectErrSpy = sinon.spy(function (dockerContainerId, error, cb) {
      cb(null)
    })

    ctx.populateModelsSpy = sinon.spy(function (cb) { cb(null) })
    ctx.populateOwnerAndCreatedBySpy = sinon.spy(function (user, cb) { cb(null, ctx.mockInstance) })

    ctx.data = {
      dockerContainer: 'abc123',
      dockerHost: '0.0.0.0',
      instanceId: 'instanceid123',
      sessionUserGithubId: '12345'
    // ownerGitHubUsername: req.sessionUser.accounts.github.login,
    // tid: req.domain.runnableData.tid
    }
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
    }
    ctx.mockContainer = {
      dockerContainer: ctx.data.dockerContainer,
      dockerHost: ctx.data.dockerHost
    }
    ctx.mockInstance.container = ctx.mockContainer
    ctx.mockUser = {
      _id: 'foo',
      toJSON: noop
    }
    ctx.worker = new StopInstanceContainerWorker(ctx.data)
    done()
  })

  beforeEach(function (done) {
    // initialize instance w/ props, don't actually run protected methods
    sinon.stub(async, 'series', noop)
    ctx.worker.handle(noop)
    async.series.restore()
    done()
  })

  describe('_finalSeriesHandler', function () {
    describe('failure without instance', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.worker, '_baseWorkerUpdateInstanceFrontend', noop)
        sinon.stub(ctx.worker, '_baseWorkerInspectContainerAndUpdate', noop)
        done()
      })
      afterEach(function (done) {
        ctx.worker._baseWorkerUpdateInstanceFrontend.restore()
        ctx.worker._baseWorkerInspectContainerAndUpdate.restore()
        done()
      })
      it('it should not inspect or notify frontend', function (done) {
        ctx.worker._finalSeriesHandler(new Error('mongoose error'), function () {
          expect(ctx.worker._baseWorkerUpdateInstanceFrontend.callCount).to.equal(0)
          expect(ctx.worker._baseWorkerInspectContainerAndUpdate.callCount).to.equal(0)
          done()
        })
      })
    })

    describe('failure with instance', function () {
      beforeEach(function (done) {
        ctx.worker.instance = ctx.mockInstance
        sinon.stub(ctx.worker, '_baseWorkerUpdateInstanceFrontend',
          function (instanceId, sessionUserGithubId, action, cb) {
            cb()
          })
        sinon.stub(ctx.worker, '_baseWorkerInspectContainerAndUpdate', function (cb) {
          cb()
        })
        done()
      })
      afterEach(function (done) {
        ctx.worker._baseWorkerUpdateInstanceFrontend.restore()
        ctx.worker._baseWorkerInspectContainerAndUpdate.restore()
        done()
      })
      it('it should inspect and notify frontend', function (done) {
        ctx.worker._finalSeriesHandler(new Error('mongoose error'), function () {
          expect(ctx.worker._baseWorkerUpdateInstanceFrontend.callCount).to.equal(1)
          expect(ctx.worker._baseWorkerInspectContainerAndUpdate.callCount).to.equal(1)
          expect(ctx.worker._baseWorkerUpdateInstanceFrontend.args[0][2]).to.equal('update')
          done()
        })
      })
    })

    describe('success', function () {
      beforeEach(function (done) {
        ctx.worker.instance = ctx.mockInstance
        sinon.stub(ctx.worker, '_baseWorkerUpdateInstanceFrontend',
          function (instanceId, sessionUserGithubId, action, cb) {
            cb()
          })
        sinon.stub(ctx.worker, '_baseWorkerInspectContainerAndUpdate', function (cb) { cb() })
        done()
      })
      afterEach(function (done) {
        ctx.worker._baseWorkerUpdateInstanceFrontend.restore()
        ctx.worker._baseWorkerInspectContainerAndUpdate.restore()
        done()
      })
      it('should not inspect and should notify frontend', function (done) {
        ctx.worker._finalSeriesHandler(null, function () {
          expect(ctx.worker._baseWorkerUpdateInstanceFrontend.callCount).to.equal(1)
          expect(ctx.worker._baseWorkerInspectContainerAndUpdate.callCount).to.equal(0)
          expect(ctx.worker._baseWorkerUpdateInstanceFrontend.args[0][2]).to.equal('stop')
          done()
        })
      })
    })
  })

  describe('_setInstanceStateStopping', function () {
    beforeEach(function (done) {
      // normally set by _findInstance & _findUser
      ctx.worker.instance = ctx.mockInstance
      ctx.worker.user = ctx.mockUser
      done()
    })
    beforeEach(function (done) {
      sinon.stub(ctx.worker, '_baseWorkerUpdateInstanceFrontend',
        function (instanceId, sessionUserGithubId, action, cb) {
          cb()
        })
      ctx.mockInstance.setContainerStateToStopping = function (cb) {
        cb(null, ctx.mockInstance)
      }
      done()
    })
    afterEach(function (done) {
      ctx.worker._baseWorkerUpdateInstanceFrontend.restore()
      done()
    })
    it('should set container state to stopping and notify frontend', function (done) {
      ctx.worker._setInstanceStateStopping(function (err) {
        expect(err).to.be.undefined()
        expect(ctx.worker._baseWorkerUpdateInstanceFrontend.callCount).to.equal(1)
        expect(ctx.worker._baseWorkerUpdateInstanceFrontend.args[0][2]).to.equal('stopping')
        done()
      })
    })
  })

  describe('_stopContainer', function () {
    beforeEach(function (done) {
      // normally set by _findInstance & _findUser
      ctx.worker.instance = ctx.mockInstance
      ctx.worker.user = ctx.mockUser
      done()
    })

    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(Docker.prototype, 'stopContainer', function (dockerContainer, cb) {
          cb(null)
        })
        done()
      })
      afterEach(function (done) {
        Docker.prototype.stopContainer.restore()
        done()
      })
      it('should callback successfully if container stop', function (done) {
        ctx.worker._stopContainer(function (err) {
          expect(err).to.be.null()
          expect(Docker.prototype.stopContainer.callCount).to.equal(1)
          expect(ctx.removeStartingStoppingStatesSpy.callCount).to.equal(1)
          done()
        })
      })
    })

    describe('failure n times', function () {
      beforeEach(function (done) {
        sinon.stub(Docker.prototype, 'stopContainer', function (dockerContainer, cb) {
          cb(new Error('docker stop container error'))
        })
        done()
      })
      afterEach(function (done) {
        Docker.prototype.stopContainer.restore()
        done()
      })
      it('should attempt to stop container n times', function (done) {
        ctx.worker._stopContainer(function (err) {
          expect(err.message).to.equal('docker stop container error')
          expect(Docker.prototype.stopContainer.callCount)
            .to.equal(process.env.WORKER_STOP_CONTAINER_NUMBER_RETRY_ATTEMPTS)
          expect(ctx.removeStartingStoppingStatesSpy.callCount).to.equal(1)
          done()
        })
      })
    })
  })
})
