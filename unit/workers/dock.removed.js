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
var rabbitMQ = require('models/rabbitmq')

var sinon = require('sinon')
var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var ContextVersion = require('models/mongo/context-version')
var Worker = require('workers/dock.removed')
var TaskFatalError = require('ponos').TaskFatalError

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('Worker: dock.removed unit test: ' + moduleName, function () {
  var testHost = 'goku'
  var testData = {
    host: testHost
  }

  describe('worker', function () {
    var testErr = 'kamehameha'

    beforeEach(function (done) {
      sinon.stub(Instance, 'findActiveInstancesByDockerHost')
      sinon.stub(ContextVersion, 'markDockRemovedByDockerHost').yieldsAsync()
      sinon.stub(Instance, 'setStoppingAsStoppedByDockerHost').yieldsAsync()
      sinon.stub(Worker, '_redeployContainers')
      sinon.stub(Worker, '_updateFrontendInstances')
      done()
    })

    afterEach(function (done) {
      Worker._redeployContainers.restore()
      Worker._updateFrontendInstances.restore()
      Instance.findActiveInstancesByDockerHost.restore()
      ContextVersion.markDockRemovedByDockerHost.restore()
      Instance.setStoppingAsStoppedByDockerHost.restore()
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
          expect(err.message).to.contain('Value does not exist')
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

    describe('findActiveInstancesByDockerHost errors', function () {
      beforeEach(function (done) {
        Instance.findActiveInstancesByDockerHost.yieldsAsync(testErr)
        ContextVersion.markDockRemovedByDockerHost.yieldsAsync(null, [])
        done()
      })

      it('should cb err', function (done) {
        Worker(testData).asCallback(function (err) {
          sinon.assert.calledOnce(Instance.findActiveInstancesByDockerHost)
          sinon.assert.calledWith(Instance.findActiveInstancesByDockerHost, testHost)
          expect(err.message).to.equal(testErr)
          done()
        })
      })

      it('should still run other sub-tasks', function (done) {
        Worker(testData).asCallback(function (err) {
          sinon.assert.calledOnce(Instance.setStoppingAsStoppedByDockerHost)
          sinon.assert.calledWith(Instance.setStoppingAsStoppedByDockerHost, testHost)
          sinon.assert.calledOnce(ContextVersion.markDockRemovedByDockerHost)
          sinon.assert.calledWith(ContextVersion.markDockRemovedByDockerHost, testHost)
          expect(err.message).to.equal(testErr)
          done()
        })
      })
    })

    describe('findActiveInstancesByDockerHost return empty', function () {
      beforeEach(function (done) {
        Instance.findActiveInstancesByDockerHost.yieldsAsync(null, [])
        done()
      })

      it('should cb without calling redeploy containers', function (done) {
        Worker(testData).asCallback(function (err) {
          sinon.assert.calledOnce(Instance.findActiveInstancesByDockerHost)
          sinon.assert.calledWith(Instance.findActiveInstancesByDockerHost, testHost)
          sinon.assert.notCalled(Worker._redeployContainers)
          sinon.assert.notCalled(Worker._updateFrontendInstances)
          expect(err).to.not.exist()
          done()
        })
      })
    })

    describe('findActiveInstancesByDockerHost returns array', function () {
      var testArray = ['1', '2']
      beforeEach(function (done) {
        Instance.findActiveInstancesByDockerHost.yieldsAsync(null, testArray)
        Worker._redeployContainers.returns(Promise.resolve())
        done()
      })

      it('should call _redeployContainers', function (done) {
        Worker(testData).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Instance.findActiveInstancesByDockerHost)
          sinon.assert.calledWith(Instance.findActiveInstancesByDockerHost, testHost)
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

    describe('ContextVersion.markDockRemovedByDockerHost returns error', function () {
      var testArray = ['1', '2']
      beforeEach(function (done) {
        ContextVersion.markDockRemovedByDockerHost.yieldsAsync(testErr)
        Instance.findActiveInstancesByDockerHost.yieldsAsync(null, testArray)
        Worker._redeployContainers.returns()
        done()
      })

      it('should error', function (done) {
        Worker(testData).asCallback(function (err) {
          expect(err.message).to.equal(testErr)
          done()
        })
      })

      it('should not run the other methods', function (done) {
        Worker(testData).asCallback(function () {
          sinon.assert.calledOnce(ContextVersion.markDockRemovedByDockerHost)
          sinon.assert.calledWith(ContextVersion.markDockRemovedByDockerHost, testHost)
          sinon.assert.notCalled(Instance.setStoppingAsStoppedByDockerHost)
          sinon.assert.notCalled(Instance.findActiveInstancesByDockerHost)
          sinon.assert.notCalled(Worker._redeployContainers)
          sinon.assert.notCalled(Worker._updateFrontendInstances)
          done()
        })
      })
    })

    describe('Instance.setStoppingAsStoppedByDockerHost returns error', function () {
      var testArray = ['1', '2']
      beforeEach(function (done) {
        Instance.setStoppingAsStoppedByDockerHost.yieldsAsync(testErr)
        Instance.findActiveInstancesByDockerHost.yieldsAsync(null, testArray)
        Worker._redeployContainers.returns()
        done()
      })

      it('should error', function (done) {
        Worker(testData).asCallback(function (err) {
          expect(err.message).to.equal(testErr)
          done()
        })
      })

      it('should not run the other methods', function (done) {
        Worker(testData).asCallback(function () {
          sinon.assert.calledOnce(ContextVersion.markDockRemovedByDockerHost)
          sinon.assert.calledWith(ContextVersion.markDockRemovedByDockerHost, testHost)
          sinon.assert.calledOnce(Instance.setStoppingAsStoppedByDockerHost)
          sinon.assert.calledWith(Instance.setStoppingAsStoppedByDockerHost, testHost)
          sinon.assert.notCalled(Instance.findActiveInstancesByDockerHost)
          sinon.assert.notCalled(Worker._redeployContainers)
          sinon.assert.notCalled(Worker._updateFrontendInstances)
          done()
        })
      })
    })
  })

  describe('#_redeployContainers', function () {
    var instances = [{
      _id: '1'
    }, {
      _id: '2'
    }]
    beforeEach(function (done) {
      sinon.stub(rabbitMQ, 'redeployInstanceContainer').returns()
      done()
    })

    afterEach(function (done) {
      rabbitMQ.redeployInstanceContainer.restore()
      done()
    })

    it('should callback with no error', function (done) {
      Worker._redeployContainers(instances)
      expect(rabbitMQ.redeployInstanceContainer.calledTwice).to.be.true()
      done()
    })
  }) // end _redeployContainers

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
