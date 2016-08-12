'use strict'

require('loadenv')()

const Lab = require('lab')
const lab = exports.lab = Lab.script()
const describe = lab.describe
const it = lab.it
const afterEach = lab.afterEach
const beforeEach = lab.beforeEach
const Code = require('code')
const expect = Code.expect
const Promise = require('bluebird')
const rabbitMQ = require('models/rabbitmq')

const sinon = require('sinon')
require('sinon-as-promised')(Promise)
const ContextVersion = require('models/mongo/context-version')
const Instance = require('models/mongo/instance')
const InstanceService = require('models/services/instance-service')
const PermissionService = require('models/services/permission-service')
const Worker = require('workers/dock.removed')
const WorkerTask = Worker.task
const WorkerStopError = require('error-cat/errors/worker-stop-error')
const errors = require('errors')

describe('Worker: dock.removed unit test', function () {
  const testTarget = 'goku'
  const testHost = 'http://' + testTarget + ':4242'
  const testData = {
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

    describe('ContextVersion.markDockRemovedByDockerHost returns error', function () {
      const testError = new Error('Mongo error')
      beforeEach(function (done) {
        ContextVersion.markDockRemovedByDockerHost.rejects(testError)
        done()
      })

      it('should error', function (done) {
        WorkerTask(testData).asCallback(function (err) {
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
      const testError = new Error('Redeploy error')
      beforeEach(function (done) {
        ContextVersion.markDockRemovedByDockerHost.resolves(null)
        const rejectionPromise = Promise.reject(testError)
        rejectionPromise.suppressUnhandledRejections()
        Worker._redeploy.returns(rejectionPromise)

        Worker._rebuild.returns(Promise.resolve())
        Worker._updateFrontendInstances.returns(Promise.resolve())
        done()
      })

      it('should error', function (done) {
        WorkerTask(testData).asCallback(function (err) {
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
      const testError = new Error('Update error')
      beforeEach(function (done) {
        ContextVersion.markDockRemovedByDockerHost.resolves(null)
        Worker._redeploy.returns(Promise.resolve())
        Worker._rebuild.returns(Promise.resolve())
        const rejectionPromise = Promise.reject(testError)
        rejectionPromise.suppressUnhandledRejections()
        Worker._updateFrontendInstances.returns(rejectionPromise)
        done()
      })

      it('should error', function (done) {
        WorkerTask(testData).asCallback(function (err) {
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
      const testError = new Error('Rebuild error')
      beforeEach(function (done) {
        ContextVersion.markDockRemovedByDockerHost.resolves(null)
        Worker._redeploy.returns(Promise.resolve())
        Worker._updateFrontendInstances.returns(Promise.resolve())
        const rejectionPromise = Promise.reject(testError)
        rejectionPromise.suppressUnhandledRejections()
        Worker._rebuild.returns(rejectionPromise)
        done()
      })

      it('should error', function (done) {
        WorkerTask(testData).asCallback(function (err) {
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
      const testError = new Error('Update error')
      beforeEach(function (done) {
        ContextVersion.markDockRemovedByDockerHost.resolves(null)
        Worker._redeploy.returns(Promise.resolve())
        Worker._rebuild.returns(Promise.resolve())
        const rejectionPromise = Promise.reject(testError)
        rejectionPromise.suppressUnhandledRejections()
        Worker._updateFrontendInstances.onCall(0).returns(Promise.resolve())
        Worker._updateFrontendInstances.onCall(1).returns(rejectionPromise)
        done()
      })

      it('should error', function (done) {
        WorkerTask(testData).asCallback(function (err) {
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
        WorkerTask(testData).asCallback(function (err) {
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
    const testErr = new Error('Mongo erro')
    const testData = {
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
        const promise = Promise.reject(testErr)
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
      const instances = [
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
            const call1 = rabbitMQ.redeployInstanceContainer.getCall(0).args
            expect(call1[0]).to.deep.equal({
              instanceId: instances[0]._id,
              sessionUserGithubId: process.env.HELLO_RUNNABLE_GITHUB_ID,
              deploymentUuid: testData.deploymentUuid
            })
            const call2 = rabbitMQ.redeployInstanceContainer.getCall(1).args
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
    const testErr = new Error('Mongo erro')
    const testData = {
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
      const instances = [
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
    const testErr = 'Problem!'
    const testData = [{
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
        const rejectionPromise = Promise.reject(testErr)
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
            const call1 = InstanceService.emitInstanceUpdate.getCall(0).args
            expect(call1[0]).to.deep.equal(testData[0])
            expect(call1[1]).to.be.null()
            expect(call1[2]).to.equal('update')
            expect(call1[3]).to.be.true()
            const call2 = InstanceService.emitInstanceUpdate.getCall(1).args
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
