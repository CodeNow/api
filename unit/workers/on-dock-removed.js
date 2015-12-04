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
var InstanceService = require('models/services/instance-service')
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
      sinon.stub(Instance, 'findActiveInstancesByDockerHostAsync')
      sinon.stub(ContextVersion, 'markDockRemovedByDockerHostAsync').returns(Promise.resolve())
      sinon.stub(Instance, 'setStoppingAsStoppedByDockerHostAsync').returns(Promise.resolve())
      sinon.stub(Worker, '_redeployContainers')
      sinon.stub(Worker, '_updateFrontendInstances')
      done()
    })

    afterEach(function (done) {
      Worker._redeployContainers.restore()
      Worker._updateFrontendInstances.restore()
      Instance.findActiveInstancesByDockerHostAsync.restore()
      ContextVersion.markDockRemovedByDockerHostAsync.restore()
      Instance.setStoppingAsStoppedByDockerHostAsync.restore()
      done()
    })

    describe('invalid Job', function () {
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
        ContextVersion.markDockRemovedByDockerHostAsync.returns(Promise.resolve([]))
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
          sinon.assert.notCalled(Worker._updateFrontendInstances)
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
          done()
        })
      })

      it('should emit instance updates after everything has completed', function (done) {
        Worker(testData).asCallback(function () {
          sinon.assert.calledOnce(Worker._updateFrontendInstances)
          sinon.assert.calledWith(Worker._updateFrontendInstances, testArray)
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

      it('should not run the other methods', function (done) {
        Worker(testData).asCallback(function () {
          sinon.assert.calledOnce(ContextVersion.markDockRemovedByDockerHostAsync)
          sinon.assert.calledWith(ContextVersion.markDockRemovedByDockerHostAsync, testHost)
          sinon.assert.notCalled(Instance.setStoppingAsStoppedByDockerHostAsync)
          sinon.assert.notCalled(Instance.findActiveInstancesByDockerHostAsync)
          sinon.assert.notCalled(Worker._redeployContainers)
          sinon.assert.notCalled(Worker._updateFrontendInstances)
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

      it('should not run the other methods', function (done) {
        Worker(testData).asCallback(function () {
          sinon.assert.calledOnce(ContextVersion.markDockRemovedByDockerHostAsync)
          sinon.assert.calledWith(ContextVersion.markDockRemovedByDockerHostAsync, testHost)
          sinon.assert.calledOnce(Instance.setStoppingAsStoppedByDockerHostAsync)
          sinon.assert.calledWith(Instance.setStoppingAsStoppedByDockerHostAsync, testHost)
          sinon.assert.notCalled(Instance.findActiveInstancesByDockerHostAsync)
          sinon.assert.notCalled(Worker._redeployContainers)
          sinon.assert.notCalled(Worker._updateFrontendInstances)
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
      sinon.stub(Runnable.prototype, 'githubLogin')
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
        Runnable.prototype.githubLogin.yieldsAsync()
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
            sinon.assert.called(redeployStub)
            done()
          })
      })
    })

    describe('redeploy passes', function () {
      beforeEach(function (done) {
        Runnable.prototype.githubLogin.yieldsAsync()
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

  describe('#_updateFrontendInstances', function () {
    var testErr = 'Problem!'
    var testData = [{
      id: '1'
    }, {
      id: '2'
    }]
    beforeEach(function (done) {
      sinon.stub(InstanceService, 'emitInstanceUpdate')
      done()
    })

    afterEach(function (done) {
      InstanceService.emitInstanceUpdate.restore()
      done()
    })

    describe('update fails for one instance', function () {
      beforeEach(function (done) {
        var rejectionPromise = Promise.reject(testErr)
        rejectionPromise.suppressUnhandledRejections()
        InstanceService.emitInstanceUpdate.onCall(0).returns(rejectionPromise)
        InstanceService.emitInstanceUpdate.onCall(1).returns(Promise.resolve())
        done()
      })

      it('should callback with error', function (done) {
        Worker._updateFrontendInstances(testData)
          .asCallback(function (err) {
            expect(err).to.equal(testErr)
            sinon.assert.called(InstanceService.emitInstanceUpdate)
            done()
          })
      })
    })

    describe('updates pass', function () {
      beforeEach(function (done) {
        InstanceService.emitInstanceUpdate.returns(Promise.resolve())
        done()
      })

      it('should return successfully', function (done) {
        Worker._updateFrontendInstances(testData)
          .asCallback(function (err) {
            expect(err).to.not.exist()
            sinon.assert.calledTwice(InstanceService.emitInstanceUpdate)
            done()
          })
      })
    })
  })
})
