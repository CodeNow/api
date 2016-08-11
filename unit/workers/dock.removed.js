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
require('sinon-as-promised')(Promise)
var ContextVersion = require('models/mongo/context-version')
var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var PermissionService = require('models/services/permission-service')
var Worker = require('workers/dock.removed')
var WorkerStopError = require('error-cat/errors/worker-stop-error')
var errors = require('errors')

describe('Worker: dock.removed unit test', function () {
  var testTarget = 'goku'
  var testHost = 'http://' + testTarget + ':4242'
  var testData = {
    host: testHost
  }

  describe('worker', function () {
    beforeEach(function (done) {
      sinon.stub(Instance, 'findInstancesBuiltByDockerHostAsync')
      sinon.stub(ContextVersion, 'markDockRemovedByDockerHost').resolves()
      sinon.stub(Worker, '_redeploy')
      sinon.stub(Worker, '_rebuild')
      sinon.stub(Worker, '_updateFrontendInstances')
      sinon.stub(rabbitMQ, 'asgInstanceTerminate').returns()
      done()
    })

    afterEach(function (done) {
      Worker._rebuild.restore()
      Worker._redeploy.restore()
      Worker._updateFrontendInstances.restore()
      Instance.findInstancesBuiltByDockerHostAsync.restore()
      ContextVersion.markDockRemovedByDockerHost.restore()
      rabbitMQ.asgInstanceTerminate.restore()
      done()
    })

    describe('invalid Job', function () {
      it('should throw a task fatal error if the job is missing a dockerhost', function (done) {
        Worker({}).asCallback(function (err) {
          expect(err).to.be.instanceOf(WorkerStopError)
          expect(err.message).to.contain('Invalid Job')
          expect(err.data.validationError.message).to.contain('host')
          expect(err.data.validationError.message).to.contain('required')
          sinon.assert.notCalled(rabbitMQ.asgInstanceTerminate)
          done()
        })
      })
      it('should throw a task fatal error if the job is missing a dockerhost', function (done) {
        Worker({host: {}}).asCallback(function (err) {
          expect(err).to.be.instanceOf(WorkerStopError)
          expect(err.message).to.contain('Invalid Job')
          expect(err.data.validationError.message).to.contain('host')
          expect(err.data.validationError.message).to.contain('a string')
          sinon.assert.notCalled(rabbitMQ.asgInstanceTerminate)
          done()
        })
      })
      it('should throw a task fatal error if foul dockerhost', function (done) {
        Worker({host: 'foul'}).asCallback(function (err) {
          expect(err).to.be.instanceOf(WorkerStopError)
          expect(err.message).to.contain('Invalid Job')
          expect(err.data.validationError.message).to.contain('host')
          expect(err.data.validationError.message).to.contain('must be a valid uri')
          sinon.assert.notCalled(rabbitMQ.asgInstanceTerminate)
          done()
        })
      })
      it('should throw a task fatal error if the job is missing entirely', function (done) {
        Worker().asCallback(function (err) {
          expect(err).to.be.instanceOf(WorkerStopError)
          expect(err.message).to.contain('Invalid Job')
          sinon.assert.notCalled(rabbitMQ.asgInstanceTerminate)
          done()
        })
      })
      it('should throw a task fatal error if the job is not an object', function (done) {
        Worker(true).asCallback(function (err) {
          expect(err).to.be.instanceOf(WorkerStopError)
          expect(err.message).to.contain('Invalid Job')
          expect(err.data.validationError.message).to.contain('must be an object')
          sinon.assert.notCalled(rabbitMQ.asgInstanceTerminate)
          done()
        })
      })
    })

    describe('ContextVersion.markDockRemovedByDockerHost returns error', function () {
      var testError = new Error('Mongo error')
      beforeEach(function (done) {
        ContextVersion.markDockRemovedByDockerHost.rejects(testError)
        done()
      })

      it('should error', function (done) {
        Worker(testData).asCallback(function (err) {
          expect(err.message).to.equal(testError.message)
          sinon.assert.calledOnce(ContextVersion.markDockRemovedByDockerHost)
          sinon.assert.calledWith(ContextVersion.markDockRemovedByDockerHost, testHost)
          sinon.assert.notCalled(Worker._redeploy)
          sinon.assert.notCalled(Worker._rebuild)
          sinon.assert.calledOnce(rabbitMQ.asgInstanceTerminate)
          sinon.assert.calledWith(rabbitMQ.asgInstanceTerminate, {
            ipAddress: testTarget
          })
          done()
        })
      })
    })

    describe('_redeploy returns error', function () {
      var testError = new Error('Redeploy error')
      beforeEach(function (done) {
        ContextVersion.markDockRemovedByDockerHost.resolves(null)
        var rejectionPromise = Promise.reject(testError)
        rejectionPromise.suppressUnhandledRejections()
        Worker._redeploy.returns(rejectionPromise)

        Worker._rebuild.returns(Promise.resolve())
        Worker._updateFrontendInstances.returns(Promise.resolve())
        done()
      })

      it('should error', function (done) {
        Worker(testData).asCallback(function (err) {
          expect(err.message).to.equal(testError.message)
          sinon.assert.calledOnce(ContextVersion.markDockRemovedByDockerHost)
          sinon.assert.calledWith(ContextVersion.markDockRemovedByDockerHost, testHost)
          sinon.assert.calledOnce(Worker._redeploy)
          sinon.assert.calledOnce(Worker._updateFrontendInstances)
          sinon.assert.calledOnce(Worker._rebuild)
          sinon.assert.calledOnce(rabbitMQ.asgInstanceTerminate)
          sinon.assert.calledWith(rabbitMQ.asgInstanceTerminate, {
            ipAddress: testTarget
          })
          done()
        })
      })
    })
    describe('_updateFrontendInstances returns error', function () {
      var testError = new Error('Update error')
      beforeEach(function (done) {
        ContextVersion.markDockRemovedByDockerHost.resolves(null)
        Worker._redeploy.returns(Promise.resolve())
        Worker._rebuild.returns(Promise.resolve())
        var rejectionPromise = Promise.reject(testError)
        rejectionPromise.suppressUnhandledRejections()
        Worker._updateFrontendInstances.returns(rejectionPromise)
        done()
      })

      it('should error', function (done) {
        Worker(testData).asCallback(function (err) {
          expect(err.message).to.equal(testError.message)
          sinon.assert.calledOnce(ContextVersion.markDockRemovedByDockerHost)
          sinon.assert.calledWith(ContextVersion.markDockRemovedByDockerHost, testHost)
          sinon.assert.calledOnce(Worker._redeploy)
          sinon.assert.calledTwice(Worker._updateFrontendInstances)
          sinon.assert.calledOnce(Worker._rebuild)
          sinon.assert.calledOnce(rabbitMQ.asgInstanceTerminate)
          sinon.assert.calledWith(rabbitMQ.asgInstanceTerminate, {
            ipAddress: testTarget
          })
          done()
        })
      })
    })
    describe('_rebuild returns error', function () {
      var testError = new Error('Rebuild error')
      beforeEach(function (done) {
        ContextVersion.markDockRemovedByDockerHost.resolves(null)
        Worker._redeploy.returns(Promise.resolve())
        Worker._updateFrontendInstances.returns(Promise.resolve())
        var rejectionPromise = Promise.reject(testError)
        rejectionPromise.suppressUnhandledRejections()
        Worker._rebuild.returns(rejectionPromise)
        done()
      })

      it('should error', function (done) {
        Worker(testData).asCallback(function (err) {
          expect(err.message).to.equal(testError.message)
          sinon.assert.calledOnce(ContextVersion.markDockRemovedByDockerHost)
          sinon.assert.calledWith(ContextVersion.markDockRemovedByDockerHost, testHost)
          sinon.assert.calledOnce(Worker._redeploy)
          sinon.assert.calledOnce(Worker._updateFrontendInstances)
          sinon.assert.calledOnce(Worker._rebuild)
          sinon.assert.calledOnce(rabbitMQ.asgInstanceTerminate)
          sinon.assert.calledWith(rabbitMQ.asgInstanceTerminate, {
            ipAddress: testTarget
          })
          done()
        })
      })
    })
    describe('_updateFrontendInstances returns error on second call', function () {
      var testError = new Error('Update error')
      beforeEach(function (done) {
        ContextVersion.markDockRemovedByDockerHost.resolves(null)
        Worker._redeploy.returns(Promise.resolve())
        Worker._rebuild.returns(Promise.resolve())
        var rejectionPromise = Promise.reject(testError)
        rejectionPromise.suppressUnhandledRejections()
        Worker._updateFrontendInstances.onCall(0).returns(Promise.resolve())
        Worker._updateFrontendInstances.onCall(1).returns(rejectionPromise)
        done()
      })

      it('should error', function (done) {
        Worker(testData).asCallback(function (err) {
          expect(err.message).to.equal(testError.message)
          sinon.assert.calledOnce(ContextVersion.markDockRemovedByDockerHost)
          sinon.assert.calledWith(ContextVersion.markDockRemovedByDockerHost, testHost)
          sinon.assert.calledOnce(Worker._redeploy)
          sinon.assert.calledOnce(Worker._rebuild)
          sinon.assert.calledTwice(Worker._updateFrontendInstances)
          sinon.assert.calledOnce(rabbitMQ.asgInstanceTerminate)
          sinon.assert.calledWith(rabbitMQ.asgInstanceTerminate, {
            ipAddress: testTarget
          })
          done()
        })
      })
    })
    describe('no errors', function () {
      beforeEach(function (done) {
        ContextVersion.markDockRemovedByDockerHost.resolves(null)
        Worker._redeploy.returns(Promise.resolve())
        Worker._updateFrontendInstances.returns(Promise.resolve())
        Worker._rebuild.returns(Promise.resolve())
        done()
      })

      it('should pass', function (done) {
        Worker(testData).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(ContextVersion.markDockRemovedByDockerHost)
          sinon.assert.calledWith(ContextVersion.markDockRemovedByDockerHost, testHost)
          sinon.assert.calledOnce(Worker._redeploy)
          sinon.assert.calledTwice(Worker._updateFrontendInstances)
          sinon.assert.calledOnce(Worker._rebuild)
          sinon.assert.calledOnce(rabbitMQ.asgInstanceTerminate)
          sinon.assert.calledWith(rabbitMQ.asgInstanceTerminate, {
            ipAddress: testTarget
          })
          done()
        })
      })
    })
  })

  describe('#_redeploy', function () {
    var testErr = new Error('Mongo erro')
    var testData = {
      host: 'http://10.12.12.14:4242'
    }
    beforeEach(function (done) {
      sinon.stub(Instance, 'findInstancesBuiltByDockerHostAsync')
      sinon.stub(rabbitMQ, 'redeployInstanceContainer').returns()
      sinon.stub(PermissionService, 'checkOwnerAllowed').resolves()
      done()
    })

    afterEach(function (done) {
      Instance.findInstancesBuiltByDockerHostAsync.restore()
      rabbitMQ.redeployInstanceContainer.restore()
      PermissionService.checkOwnerAllowed.restore()
      done()
    })

    describe('#findInstancesBuiltByDockerHostAsync fails', function () {
      beforeEach(function (done) {
        var promise = Promise.reject(testErr)
        promise.suppressUnhandledRejections()
        Instance.findInstancesBuiltByDockerHostAsync.returns(promise)
        done()
      })

      it('should callback with error', function (done) {
        Worker._redeploy(testData)
          .asCallback(function (err) {
            expect(err.message).to.equal(testErr.message)
            sinon.assert.calledOnce(Instance.findInstancesBuiltByDockerHostAsync)
            sinon.assert.calledWith(Instance.findInstancesBuiltByDockerHostAsync, testData.host)
            done()
          })
      })
    })

    describe('#findInstancesBuiltByDockerHostAsync returns 2 instances', function () {
      var instances = [
        { _id: '1', owner: { github: '213333' } },
        { _id: '2', owner: { github: '213333' } }
      ]
      beforeEach(function (done) {
        Instance.findInstancesBuiltByDockerHostAsync.returns(Promise.resolve(instances))
        done()
      })

      it('should fatally fail if owner is not whitelisted', function (done) {
        PermissionService.checkOwnerAllowed.rejects(new errors.OrganizationNotFoundError('Organization not found'))
        testData.deploymentUuid = 'some-unique-uuid'
        Worker._redeploy(testData)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal('Organization is not whitelisted, no need to redeploy')
            expect(err).to.be.instanceOf(WorkerStopError)
            done()
          })
      })

      it('should fatally fail if owner is not allowed', function (done) {
        PermissionService.checkOwnerAllowed.rejects(new errors.OrganizationNotAllowedError('Organization is not allowed'))
        testData.deploymentUuid = 'some-unique-uuid'
        Worker._redeploy(testData)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal('Organization is not allowed, no need to redeploy')
            expect(err).to.be.instanceOf(WorkerStopError)
            done()
          })
      })

      it('should return successfully', function (done) {
        testData.deploymentUuid = 'some-unique-uuid'
        Worker._redeploy(testData)
          .asCallback(function (err) {
            expect(err).to.not.exist()
            sinon.assert.calledOnce(Instance.findInstancesBuiltByDockerHostAsync)
            sinon.assert.calledWith(Instance.findInstancesBuiltByDockerHostAsync, testData.host)
            sinon.assert.calledTwice(rabbitMQ.redeployInstanceContainer)
            var call1 = rabbitMQ.redeployInstanceContainer.getCall(0).args
            expect(call1[0]).to.deep.equal({
              instanceId: instances[0]._id,
              sessionUserGithubId: process.env.HELLO_RUNNABLE_GITHUB_ID,
              deploymentUuid: testData.deploymentUuid
            })
            var call2 = rabbitMQ.redeployInstanceContainer.getCall(1).args
            expect(call2[0]).to.deep.equal({
              instanceId: instances[1]._id,
              sessionUserGithubId: process.env.HELLO_RUNNABLE_GITHUB_ID,
              deploymentUuid: testData.deploymentUuid
            })
            done()
          })
      })
    })
  })

  describe('#_rebuild', function () {
    var testErr = new Error('Mongo erro')
    var testData = {
      host: 'http://10.12.12.14:4242'
    }
    beforeEach(function (done) {
      sinon.stub(Instance, 'findInstancesBuildingOnDockerHost')
      sinon.stub(rabbitMQ, 'publishInstanceRebuild')
      sinon.stub(PermissionService, 'checkOwnerAllowed').resolves()
      done()
    })

    afterEach(function (done) {
      Instance.findInstancesBuildingOnDockerHost.restore()
      rabbitMQ.publishInstanceRebuild.restore()
      PermissionService.checkOwnerAllowed.restore()
      done()
    })

    describe('#findInstancesBuildingOnDockerHost fails', function () {
      beforeEach(function (done) {
        Instance.findInstancesBuildingOnDockerHost.yieldsAsync(testErr)
        done()
      })

      it('should callback with error', function (done) {
        Worker._rebuild(testData)
          .asCallback(function (err) {
            expect(err.message).to.equal(testErr.message)
            sinon.assert.calledOnce(Instance.findInstancesBuildingOnDockerHost)
            sinon.assert.calledWith(Instance.findInstancesBuildingOnDockerHost, testData.host)
            done()
          })
      })
    })

    describe('#findInstancesBuildingOnDockerHost returns 2 instances', function () {
      var instances = [
        { _id: '1', owner: { github: '213333' } },
        { _id: '2', owner: { github: '213333' } }
      ]
      beforeEach(function (done) {
        Instance.findInstancesBuildingOnDockerHost.yieldsAsync(null, instances)
        done()
      })

      it('should fatally fail if owner is not whitelisted', function (done) {
        PermissionService.checkOwnerAllowed.rejects(new errors.OrganizationNotFoundError('Organization not found'))
        testData.deploymentUuid = 'some-unique-uuid'
        Worker._rebuild(testData)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal('Organization is not whitelisted, no need to rebuild')
            expect(err).to.be.instanceOf(WorkerStopError)
            done()
          })
      })

      it('should fatally fail if owner is not allowed', function (done) {
        PermissionService.checkOwnerAllowed.rejects(new errors.OrganizationNotAllowedError('Organization is not allowed'))
        testData.deploymentUuid = 'some-unique-uuid'
        Worker._rebuild(testData)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal('Organization is not allowed, no need to rebuild')
            expect(err).to.be.instanceOf(WorkerStopError)
            done()
          })
      })

      it('should return successfully', function (done) {
        testData.deploymentUuid = 'some-unique-uuid'
        Worker._rebuild(testData)
          .asCallback(function (err) {
            expect(err).to.not.exist()
            sinon.assert.calledOnce(Instance.findInstancesBuildingOnDockerHost)
            sinon.assert.calledWith(Instance.findInstancesBuildingOnDockerHost, testData.host)
            sinon.assert.calledTwice(rabbitMQ.publishInstanceRebuild)
            expect(rabbitMQ.publishInstanceRebuild.getCall(0).args[0]).to.deep.equal({
              instanceId: '1',
              deploymentUuid: testData.deploymentUuid
            })
            expect(rabbitMQ.publishInstanceRebuild.getCall(1).args[0]).to.deep.equal({
              instanceId: '2',
              deploymentUuid: testData.deploymentUuid
            })
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

    describe('emitUpdate fails for one instance', function () {
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

    describe('emitUpdate pass', function () {
      beforeEach(function (done) {
        InstanceService.emitInstanceUpdate.returns(Promise.resolve())
        done()
      })

      it('should return successfully', function (done) {
        Worker._updateFrontendInstances(testData)
          .asCallback(function (err) {
            expect(err).to.not.exist()
            sinon.assert.calledTwice(InstanceService.emitInstanceUpdate)
            var call1 = InstanceService.emitInstanceUpdate.getCall(0).args
            expect(call1[0]).to.deep.equal(testData[0])
            expect(call1[1]).to.be.null()
            expect(call1[2]).to.equal('update')
            expect(call1[3]).to.be.true()
            var call2 = InstanceService.emitInstanceUpdate.getCall(1).args
            expect(call2[0]).to.deep.equal(testData[1])
            expect(call2[1]).to.be.null()
            expect(call2[2]).to.equal('update')
            expect(call2[3]).to.be.true()
            done()
          })
      })
    })
  })
})
