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
const errors = require('errors')

describe('Worker: dock.removed unit test', function () {
  const testTarget = 'goku'
  const testHost = 'http://' + testTarget + ':4242'
  const testGithubOrgId = 1738
  const testData = {
    host: testHost,
    githubOrgId: testGithubOrgId
  }
  const rebuildInstances = [
    new Instance({ _id: '1', owner: { github: '213333' } }),
    new Instance({ _id: '2', owner: { github: '213333' } })
  ]

  const redeployInstances = [
    new Instance({ _id: '3', owner: { github: '213333' } }),
    new Instance({ _id: '4', owner: { github: '213333' } })
  ]

  describe('worker', function () {
    beforeEach(function (done) {
      sinon.stub(Instance, 'findInstancesBuiltByDockerHost').resolves(redeployInstances)
      sinon.stub(Instance, 'findInstancesBuildingOnDockerHost').resolves(rebuildInstances)
      sinon.stub(ContextVersion, 'markDockRemovedByDockerHost').resolves(null)
      sinon.stub(InstanceService, 'emitInstanceUpdate').resolves(null)
      sinon.stub(rabbitMQ, 'dockPurged').returns()
      sinon.stub(rabbitMQ, 'redeployInstanceContainer').returns()
      sinon.stub(rabbitMQ, 'publishInstanceRebuild').returns()
      sinon.stub(PermissionService, 'checkOwnerAllowed').resolves()
      sinon.stub(Instance.prototype, 'unsetContainer').resolves()
      done()
    })

    afterEach(function (done) {
      InstanceService.emitInstanceUpdate.restore()
      Instance.findInstancesBuiltByDockerHost.restore()
      Instance.findInstancesBuildingOnDockerHost.restore()
      ContextVersion.markDockRemovedByDockerHost.restore()
      rabbitMQ.dockPurged.restore()
      rabbitMQ.redeployInstanceContainer.restore()
      rabbitMQ.publishInstanceRebuild.restore()
      PermissionService.checkOwnerAllowed.restore()
      Instance.prototype.unsetContainer.restore()
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
          sinon.assert.notCalled(Instance.findInstancesBuiltByDockerHost)
          sinon.assert.notCalled(Instance.findInstancesBuildingOnDockerHost)
          sinon.assert.notCalled(InstanceService.emitInstanceUpdate)
          sinon.assert.calledOnce(rabbitMQ.dockPurged)
          sinon.assert.calledWith(rabbitMQ.dockPurged, {
            ipAddress: testTarget,
            githubOrgId: testGithubOrgId
          })
          done()
        })
      })
    })

    describe('_redeploy returns error', function () {
      it('should error', function (done) {
        const testError = new Error('Redeploy error')
        Instance.findInstancesBuiltByDockerHost.rejects(testError)
        WorkerTask(testData).asCallback(function (err) {
          expect(err.message).to.equal(testError.message)
          sinon.assert.calledOnce(ContextVersion.markDockRemovedByDockerHost)
          sinon.assert.calledWith(ContextVersion.markDockRemovedByDockerHost, testHost)
          sinon.assert.calledOnce(Instance.findInstancesBuiltByDockerHost)
          sinon.assert.calledOnce(Instance.findInstancesBuildingOnDockerHost)
          sinon.assert.notCalled(InstanceService.emitInstanceUpdate)
          sinon.assert.calledOnce(rabbitMQ.dockPurged)
          sinon.assert.calledWith(rabbitMQ.dockPurged, {
            ipAddress: testTarget,
            githubOrgId: testGithubOrgId
          })
          done()
        })
      })
    })

    describe('_updateFrontendInstances returns error', function () {
      it('should error', function (done) {
        const testError = new Error('Update error')
        InstanceService.emitInstanceUpdate.rejects(testError)
        WorkerTask(testData).asCallback(function (err) {
          expect(err.message).to.equal(testError.message)
          sinon.assert.calledOnce(ContextVersion.markDockRemovedByDockerHost)
          sinon.assert.calledWith(ContextVersion.markDockRemovedByDockerHost, testHost)
          sinon.assert.callCount(InstanceService.emitInstanceUpdate, 4)
          sinon.assert.calledOnce(rabbitMQ.dockPurged)
          sinon.assert.calledWith(rabbitMQ.dockPurged, {
            ipAddress: testTarget,
            githubOrgId: testGithubOrgId
          })
          done()
        })
      })
    })
    describe('_rebuild returns error', function () {
      it('should error', function (done) {
        const testError = new Error('Rebuild error')
        Instance.findInstancesBuildingOnDockerHost.rejects(testError)
        WorkerTask(testData).asCallback(function (err) {
          expect(err.message).to.equal(testError.message)
          sinon.assert.calledOnce(ContextVersion.markDockRemovedByDockerHost)
          sinon.assert.calledWith(ContextVersion.markDockRemovedByDockerHost, testHost)
          sinon.assert.calledOnce(Instance.findInstancesBuiltByDockerHost)
          sinon.assert.calledOnce(Instance.findInstancesBuildingOnDockerHost)
          sinon.assert.notCalled(InstanceService.emitInstanceUpdate)
          sinon.assert.calledOnce(rabbitMQ.dockPurged)
          sinon.assert.calledWith(rabbitMQ.dockPurged, {
            ipAddress: testTarget,
            githubOrgId: testGithubOrgId
          })
          done()
        })
      })
    })
    describe('no errors', function () {
      it('should call instance container cleanup if owner is not whitelisted', function (done) {
        PermissionService.checkOwnerAllowed.onCall(3).rejects(new errors.OrganizationNotFoundError('Organization not found'))
        testData.deploymentUuid = 'some-unique-uuid'
        WorkerTask(testData).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Instance.prototype.unsetContainer)
          done()
        })
      })

      it('should call instance container cleanup if owner is not allowed', function (done) {
        PermissionService.checkOwnerAllowed.onCall(3).rejects(new errors.OrganizationNotAllowedError('Organization is not allowed'))
        testData.deploymentUuid = 'some-unique-uuid'
        WorkerTask(testData).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Instance.prototype.unsetContainer)
          done()
        })
      })
      it('should call instance container cleanup if owner is not whitelisted', function (done) {
        PermissionService.checkOwnerAllowed.onCall(0).rejects(new errors.OrganizationNotFoundError('Organization not found'))
        testData.deploymentUuid = 'some-unique-uuid'
        WorkerTask(testData).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Instance.prototype.unsetContainer)
          done()
        })
      })

      it('should call instance container cleanup if owner is not allowed', function (done) {
        PermissionService.checkOwnerAllowed.onCall(0).rejects(new errors.OrganizationNotAllowedError('Organization is not allowed'))
        testData.deploymentUuid = 'some-unique-uuid'
        WorkerTask(testData).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Instance.prototype.unsetContainer)
          done()
        })
      })
      it('should pass', function (done) {
        WorkerTask(testData).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(ContextVersion.markDockRemovedByDockerHost)
          sinon.assert.calledWith(ContextVersion.markDockRemovedByDockerHost, testHost)
          sinon.assert.callCount(InstanceService.emitInstanceUpdate, 4)
          sinon.assert.calledOnce(rabbitMQ.dockPurged)
          sinon.assert.calledOnce(Instance.findInstancesBuiltByDockerHost)
          sinon.assert.calledOnce(Instance.findInstancesBuildingOnDockerHost)
          sinon.assert.calledWith(rabbitMQ.dockPurged, {
            ipAddress: testTarget,
            githubOrgId: testGithubOrgId
          })
          done()
        })
      })
    })
  })
})
