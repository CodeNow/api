'use strict'

require('loadenv')()

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var Code = require('code')
var expect = Code.expect
var Promise = require('bluebird')
var Runnable = require('runnable')

var sinon = require('sinon')
var Instance = require('models/mongo/instance')
var ContextVersion = require('models/mongo/context-version')
var Worker = require('workers/on-dock-removed')
var TaskFatalError = require('ponos').TaskFatalError

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('Worker: on-dock-removed unit test: ' + moduleName, function () {
  var testHost = 'goku'
  var testData = {
    host: testHost
  }

  describe('worker', function () {
    var testErr = 'kamehameha'

    beforeEach(function (done) {
      sinon.stub(Instance, 'findActiveInstancesByDockerHostAsync').returns(Promise.resolve([]))
      sinon.stub(ContextVersion, 'markDockRemovedByDockerHostAsync').returns(Promise.resolve())
      sinon.stub(Instance, 'setStoppingAsStoppedByDockerHostAsync').returns(Promise.resolve())
      sinon.stub(Instance, 'emitInstanceUpdatesAsync').returns(Promise.resolve())
      sinon.stub(Worker, '_redeployContainers')
      done()
    })

    afterEach(function (done) {
      Worker._redeployContainers.restore()
      Instance.findActiveInstancesByDockerHostAsync.restore()
      ContextVersion.markDockRemovedByDockerHostAsync.restore()
      Instance.setStoppingAsStoppedByDockerHostAsync.restore()
      Instance.emitInstanceUpdatesAsync.restore()
      done()
    })

    describe('invalid Job', function (){
      it('should throw a task fatal error if the job is missing a dockerhost', function (done) {
        Worker({}).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('host')
          expect(err.message).to.contain('required')
          done()
        })
      })
      it('should throw a task fatal error if the job is missing a dockerhost', function (done) {
        Worker({host: {}}).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('host')
          expect(err.message).to.contain('a string')
          done()
        })
      })
      it('should throw a task fatal error if the job is missing entirely', function (done) {
        Worker().asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('must be an object')
          done()
        })
      })
      it('should throw a task fatal error if the job is not an object', function (done) {
        Worker(true).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('must be an object')
          done()
        })
      })
    })

    describe('findActiveInstancesByDockerHostAsync errors', function () {
      beforeEach(function (done) {
        var rejectedPromise = Promise.reject(testErr)
        rejectedPromise.suppressUnhandledRejections()
        Instance.findActiveInstancesByDockerHostAsync.returns(rejectedPromise)
        done()
      })

      it('should cb err', function (done) {
        Worker(testData).asCallback(function (err) {
          sinon.assert.calledOnce(Instance.findActiveInstancesByDockerHostAsync)
          sinon.assert.calledWith(Instance.findActiveInstancesByDockerHostAsync, testHost)
          expect(err).to.equal(testErr)
          done()
        })
      })

      it('should still run other sub-tasks', function (done) {
        Worker(testData).asCallback(function (err) {
          sinon.assert.calledOnce(Instance.setStoppingAsStoppedByDockerHostAsync)
          sinon.assert.calledWith(Instance.setStoppingAsStoppedByDockerHostAsync, testHost)
          sinon.assert.calledOnce(ContextVersion.markDockRemovedByDockerHostAsync)
          sinon.assert.calledWith(ContextVersion.markDockRemovedByDockerHostAsync, testHost)
          expect(err).to.equal(testErr)
          done()
        })
      })
    })

    describe('findActiveInstancesByDockerHostAsync return empty', function () {
      beforeEach(function (done) {
        Instance.findActiveInstancesByDockerHostAsync.returns(Promise.resolve([]))
        done()
      })

      it('should cb without calling redeploy containers', function (done) {
        Worker(testData).asCallback(function (err) {
          sinon.assert.calledOnce(Instance.findActiveInstancesByDockerHostAsync)
          sinon.assert.calledWith(Instance.findActiveInstancesByDockerHostAsync, testHost)
          sinon.assert.notCalled(Worker._redeployContainers)
          expect(err).to.not.exist()
          done()
        })
      })
    })

    describe('findActiveInstancesByDockerHostAsync returns array', function () {
      var testArray = ['1', '2']
      beforeEach(function (done) {
        Instance.findActiveInstancesByDockerHostAsync.returns(Promise.resolve(testArray))
        Worker._redeployContainers.returns(Promise.resolve())
        done()
      })

      it('should call _redeployContainers', function (done) {
        Worker(testData).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Instance.findActiveInstancesByDockerHostAsync)
          sinon.assert.calledWith(Instance.findActiveInstancesByDockerHostAsync, testHost)
          sinon.assert.calledOnce(Worker._redeployContainers)
          sinon.assert.calledWith(Worker._redeployContainers, testArray)
          sinon.assert.calledOnce(Instance.emitInstanceUpdatesAsync)
          done()
        })
      })

      it('should emit instance updates after everything has completed', function (done) {
        Worker(testData).asCallback(function () {
          sinon.assert.calledOnce(Instance.emitInstanceUpdatesAsync)
          sinon.assert.calledWith(Instance.emitInstanceUpdatesAsync, null, {'container.dockerHost': testHost}, 'update')
          done()
        })
      })
    })

    describe('ContextVersion.markDockRemovedByDockerHostAsync returns error', function () {
      var testArray = ['1', '2']
      beforeEach(function (done) {
        var rejectionPromise = Promise.reject(testErr)
        rejectionPromise.suppressUnhandledRejections()
        ContextVersion.markDockRemovedByDockerHostAsync.returns(rejectionPromise)
        Instance.findActiveInstancesByDockerHostAsync.returns(Promise.resolve(testArray))
        Worker._redeployContainers.returns(Promise.resolve())
        done()
      })

      it('should error', function (done) {
        Worker(testData).asCallback(function (err) {
          expect(err).to.equal(testErr)
          done()
        })
      })

      it('should run the other methods', function (done) {
        Worker(testData).asCallback(function () {
          sinon.assert.calledOnce(Instance.findActiveInstancesByDockerHostAsync)
          sinon.assert.calledWith(Instance.findActiveInstancesByDockerHostAsync, testHost)
          sinon.assert.calledOnce(Worker._redeployContainers)
          sinon.assert.calledWith(Worker._redeployContainers, testArray)
          sinon.assert.calledOnce(Instance.setStoppingAsStoppedByDockerHostAsync)
          sinon.assert.calledWith(Instance.setStoppingAsStoppedByDockerHostAsync, testHost)
          sinon.assert.calledOnce(ContextVersion.markDockRemovedByDockerHostAsync)
          sinon.assert.calledWith(ContextVersion.markDockRemovedByDockerHostAsync, testHost)
          done()
        })
      })

      it('should emit instance updates after everything has completed, even if there is a failure', function (done) {
        Worker(testData).asCallback(function () {
          sinon.assert.calledOnce(Instance.emitInstanceUpdatesAsync)
          sinon.assert.calledWith(Instance.emitInstanceUpdatesAsync, null, {'container.dockerHost': testHost}, 'update')
          done()
        })
      })
    })

    describe('Instance.setStoppingAsStoppedByDockerHostAsync returns error', function () {
      var testArray = ['1', '2']
      beforeEach(function (done) {
        var rejectionPromise = Promise.reject(testErr)
        rejectionPromise.suppressUnhandledRejections()
        Instance.setStoppingAsStoppedByDockerHostAsync.returns(rejectionPromise)
        Instance.findActiveInstancesByDockerHostAsync.returns(Promise.resolve(testArray))
        Worker._redeployContainers.returns(Promise.resolve())
        done()
      })

      it('should error', function (done) {
        Worker(testData).asCallback(function (err) {
          expect(err).to.equal(testErr)
          done()
        })
      })

      it('should run the other methods', function (done) {
        Worker(testData).asCallback(function () {
          sinon.assert.calledOnce(Instance.findActiveInstancesByDockerHostAsync)
          sinon.assert.calledWith(Instance.findActiveInstancesByDockerHostAsync, testHost)
          sinon.assert.calledOnce(Worker._redeployContainers)
          sinon.assert.calledWith(Worker._redeployContainers, testArray)
          sinon.assert.calledOnce(Instance.setStoppingAsStoppedByDockerHostAsync)
          sinon.assert.calledWith(Instance.setStoppingAsStoppedByDockerHostAsync, testHost)
          sinon.assert.calledOnce(ContextVersion.markDockRemovedByDockerHostAsync)
          sinon.assert.calledWith(ContextVersion.markDockRemovedByDockerHostAsync, testHost)
          done()
        })
      })
    })
  })

  describe('#_redeployContainers', function () {
    var testErr = 'fire'
    var testData = [{
      id: '1'
    }, {
      id: '2'
    }]
    var redeployStub
    beforeEach(function (done) {
      redeployStub = sinon.stub()
      sinon.stub(Runnable.prototype, 'githubLogin').yieldsAsync()
      sinon.stub(Runnable.prototype, 'newInstance').returns({
        redeployAsync: redeployStub
      })
      done()
    })

    afterEach(function (done) {
      Runnable.prototype.githubLogin.restore()
      Runnable.prototype.newInstance.restore()
      done()
    })

    describe('user login fails', function () {
      beforeEach(function (done) {
        Runnable.prototype.githubLogin.yieldsAsync(new Error(testErr))
        done()
      })

      it('should callback with error', function (done) {
        Worker._redeployContainers(testData)
          .asCallback(function (err) {
            expect(err.message).to.equal(testErr)
            sinon.assert.notCalled(redeployStub)
            done()
          })
      })
    })

    describe('redeploy fails for one instance', function () {
      beforeEach(function (done) {
        var rejectionPromise = Promise.reject(testErr)
        rejectionPromise.suppressUnhandledRejections()
        redeployStub.onCall(0).returns(rejectionPromise)
        redeployStub.onCall(1).returns(Promise.resolve())
        done()
      })

      it('should callback with error', function (done) {
        Worker._redeployContainers(testData)
          .asCallback(function (err) {
            expect(err).to.equal(testErr)
            sinon.assert.calledOnce(redeployStub)
            done()
          })
      })
    })

    describe('redeploy passes', function () {
      beforeEach(function (done) {
        redeployStub.returns(Promise.resolve())
        done()
      })

      it('should callback with no error', function (done) {
        Worker._redeployContainers(testData)
          .asCallback(function (err) {
            expect(err).to.not.exist()
            sinon.assert.calledTwice(redeployStub)
            done()
          })
      })
    })
  })
})
