/**
 * @module unit/workers/start-instance-container
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')
var async = require('async')
var noop = require('101/noop')
var sinon = require('sinon')

var Docker = require('models/apis/docker')
var StartInstanceContainerWorker = require('workers/start-instance-container')

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('StartInstanceContainerWorker: ' + moduleName, function () {
  var ctx

  beforeEach(function (done) {
    ctx = {}

    // spies
    ctx.removeStartingStoppingStatesSpy = sinon.spy(function (cb) { cb() })
    ctx.populateModelsSpy = sinon.spy(function (cb) { cb(null) })
    ctx.populateOwnerAndCreatedBySpy = sinon.spy(function (user, cb) { cb(null, ctx.mockInstance) })

    ctx.data = {
      dockerContainer: 'abc123',
      dockerHost: '0.0.0.0',
      instanceId: 'instanceid123',
      sessionUserGithubId: '12345',
      // hostIp: req.instance.network.hostIp,
      inspectData: {
        Config: {
          Labels: {
          }
        }
      }
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
    ctx.worker = new StartInstanceContainerWorker(ctx.data)
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
        sinon.stub(ctx.worker, '_baseWorkerUpdateInstanceFrontend').yieldsAsync(null)
        done()
      })
      afterEach(function (done) {
        ctx.worker._baseWorkerUpdateInstanceFrontend.restore()
        done()
      })
      it('it should not notify frontend', function (done) {
        ctx.worker._finalSeriesHandler(new Error('mongoose error'), function () {
          expect(ctx.worker._baseWorkerUpdateInstanceFrontend.callCount).to.equal(0)
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
        done()
      })
      afterEach(function (done) {
        ctx.worker._baseWorkerUpdateInstanceFrontend.restore()
        done()
      })
      it('it should notify frontend', function (done) {
        ctx.worker._finalSeriesHandler(new Error('mongoose error'), function () {
          expect(ctx.worker._baseWorkerUpdateInstanceFrontend.callCount).to.equal(1)
          expect(ctx.worker._baseWorkerUpdateInstanceFrontend.args[0][0])
            .to.equal(ctx.data.instanceId)
          expect(ctx.worker._baseWorkerUpdateInstanceFrontend.args[0][1])
            .to.equal(ctx.data.sessionUserGithubId)
          expect(ctx.worker._baseWorkerUpdateInstanceFrontend.args[0][2])
            .to.equal('update')
          done()
        })
      })
    })

    describe('success', function () {
      beforeEach(function (done) {
        ctx.worker.instance = ctx.mockInstance
        sinon.stub(ctx.worker, '_baseWorkerUpdateInstanceFrontend').yieldsAsync(null)
        done()
      })
      afterEach(function (done) {
        ctx.worker._baseWorkerUpdateInstanceFrontend.restore()
        done()
      })
      it('it should NOT notify frontend', function (done) {
        ctx.worker._finalSeriesHandler(null, function () {
          expect(ctx.worker._baseWorkerUpdateInstanceFrontend.callCount).to.equal(0)
          done()
        })
      })
    })
  })

  describe('_setInstanceStateStarting', function () {
    beforeEach(function (done) {
      // normally set by _findInstance & _findUser
      ctx.worker.instance = ctx.mockInstance
      ctx.worker.user = ctx.mockUser
      done()
    })
    beforeEach(function (done) {
      sinon.stub(ctx.worker, '_baseWorkerUpdateInstanceFrontend').yieldsAsync(null)
      ctx.mockInstance.setContainerStateToStarting = function (cb) {
        cb(null, ctx.mockInstance)
      }
      done()
    })
    afterEach(function (done) {
      ctx.worker._baseWorkerUpdateInstanceFrontend.restore()
      done()
    })
    it('should set container state to starting and notify frontend', function (done) {
      ctx.worker._setInstanceStateStarting(function (err) {
        expect(err).to.be.null()
        expect(ctx.worker._baseWorkerUpdateInstanceFrontend.callCount).to.equal(1)
        expect(ctx.worker._baseWorkerUpdateInstanceFrontend.args[0][0])
          .to.equal(ctx.data.instanceId)
        expect(ctx.worker._baseWorkerUpdateInstanceFrontend.args[0][1])
          .to.equal(ctx.data.sessionUserGithubId)
        expect(ctx.worker._baseWorkerUpdateInstanceFrontend.args[0][2])
          .to.equal('starting')
        done()
      })
    })
  })

  describe('_startContainer', function () {
    beforeEach(function (done) {
      // normally set by _findInstance & _findUser
      ctx.worker.instance = ctx.mockInstance
      ctx.worker.user = ctx.mockUser
      done()
    })

    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(Docker.prototype, 'startUserContainer', function (dockerContainer, sessionUserGithubId, cb) {
          cb(null)
        })
        done()
      })
      afterEach(function (done) {
        Docker.prototype.startUserContainer.restore()
        done()
      })
      it('should callback successfully if container start', function (done) {
        ctx.worker._startContainer(function (err) {
          expect(err).to.be.null()
          expect(Docker.prototype.startUserContainer.callCount).to.equal(1)
          expect(ctx.removeStartingStoppingStatesSpy.callCount).to.equal(1)
          done()
        })
      })
    })

    describe('failure n times', function () {
      beforeEach(function (done) {
        sinon.stub(Docker.prototype, 'startUserContainer', function (dockerContainer, sessionUserGithubId, cb) {
          cb(new Error('docker start container error'))
        })
        done()
      })
      afterEach(function (done) {
        Docker.prototype.startUserContainer.restore()
        done()
      })
      it('should attempt to start container n times', function (done) {
        ctx.worker._startContainer(function (err) {
          expect(err.message).to.equal('docker start container error')
          expect(Docker.prototype.startUserContainer.callCount)
            .to.equal(1)
          expect(ctx.removeStartingStoppingStatesSpy.callCount).to.equal(1)
          done()
        })
      })
    })

    describe('failure already-started', function () {
      beforeEach(function (done) {
        sinon.stub(Docker.prototype, 'startUserContainer', function (dockerContainer, sessionUserGithubId, cb) {
          cb({
            output: {
              statusCode: 304
            }
          })
        })
        done()
      })
      afterEach(function (done) {
        Docker.prototype.startUserContainer.restore()
        done()
      })
      it('should attempt to start container n times', function (done) {
        ctx.worker._startContainer(function (err) {
          expect(err).to.be.null()
          expect(Docker.prototype.startUserContainer.callCount)
            .to.equal(1)
          expect(ctx.removeStartingStoppingStatesSpy.callCount).to.equal(1)
          done()
        })
      })
    })
  })
})
