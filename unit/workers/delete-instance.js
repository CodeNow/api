'use strict'

require('loadenv')()
var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect
var Promise = require('bluebird')
var sinon = require('sinon')

var Boom = require('dat-middleware').Boom
var DeleteInstance = require('workers/delete-instance')
var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var messenger = require('socket/messenger')
var rabbitMQ = require('models/rabbitmq')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('Worker: delete-instance: ' + moduleName, function () {
  describe('#handle', function () {
    beforeEach(function (done) {
      sinon.stub(DeleteInstance.prototype, '_baseWorkerFindInstance').yieldsAsync(null, new Instance({_id: '507f1f77bcf86cd799439011', name: 'api'}))
      sinon.stub(InstanceService, 'deleteAllInstanceForks').returns(Promise.resolve())
      sinon.stub(Instance.prototype, 'removeSelfFromGraph').yieldsAsync(null)
      sinon.stub(Instance.prototype, 'remove').yieldsAsync(null)
      sinon.stub(rabbitMQ, 'deleteInstanceContainer').returns()
      sinon.stub(messenger, 'emitInstanceDelete').returns()
      sinon.stub(DeleteInstance.prototype, '_handleError').yieldsAsync(null)
      done()
    })
    afterEach(function (done) {
      DeleteInstance.prototype._baseWorkerFindInstance.restore()
      InstanceService.deleteAllInstanceForks.restore()
      Instance.prototype.removeSelfFromGraph.restore()
      Instance.prototype.remove.restore()
      rabbitMQ.deleteInstanceContainer.restore()
      messenger.emitInstanceDelete.restore()
      DeleteInstance.prototype._handleError.restore()
      done()
    })
    it('should fail job if _baseWorkerFindInstance call failed', function (done) {
      var worker = new DeleteInstance({
        instanceId: '507f1f77bcf86cd799439011',
        sessionUserId: '507f191e810c19729de860ea'
      })
      var stepErr = Boom.badRequest('_baseWorkerFindInstance error')
      DeleteInstance.prototype._baseWorkerFindInstance.yieldsAsync(stepErr)
      worker.handle(function (jobErr) {
        expect(jobErr).to.not.exist()
        sinon.assert.calledOnce(DeleteInstance.prototype._baseWorkerFindInstance)
        sinon.assert.calledWith(DeleteInstance.prototype._baseWorkerFindInstance, {_id: worker.data.instanceId})
        sinon.assert.calledOnce(DeleteInstance.prototype._handleError)
        sinon.assert.calledWith(DeleteInstance.prototype._handleError)
        expect(DeleteInstance.prototype._handleError.getCall(0).args[0]).to.equal(stepErr)
        sinon.assert.notCalled(Instance.prototype.removeSelfFromGraph)
        sinon.assert.notCalled(Instance.prototype.remove)
        sinon.assert.notCalled(rabbitMQ.deleteInstanceContainer)
        sinon.assert.notCalled(messenger.emitInstanceDelete)
        done()
      })
    })
    it('should fail job if removeSelfFromGraph call failed', function (done) {
      var worker = new DeleteInstance({
        instanceId: '507f1f77bcf86cd799439011',
        sessionUserId: '507f191e810c19729de860ea'
      })
      var stepErr = Boom.badRequest('removeSelfFromGraph error')
      Instance.prototype.removeSelfFromGraph.yieldsAsync(stepErr)
      worker.handle(function (jobErr) {
        expect(jobErr).to.not.exist()
        sinon.assert.calledOnce(DeleteInstance.prototype._baseWorkerFindInstance)
        sinon.assert.calledWith(DeleteInstance.prototype._baseWorkerFindInstance, {_id: worker.data.instanceId})
        sinon.assert.calledOnce(DeleteInstance.prototype._handleError)
        sinon.assert.calledWith(DeleteInstance.prototype._handleError)
        expect(DeleteInstance.prototype._handleError.getCall(0).args[0]).to.equal(stepErr)
        sinon.assert.calledOnce(Instance.prototype.removeSelfFromGraph)
        sinon.assert.notCalled(Instance.prototype.remove)
        sinon.assert.notCalled(rabbitMQ.deleteInstanceContainer)
        sinon.assert.notCalled(messenger.emitInstanceDelete)
        done()
      })
    })
    it('should fail job if remove call failed', function (done) {
      var worker = new DeleteInstance({
        instanceId: '507f1f77bcf86cd799439011',
        sessionUserId: '507f191e810c19729de860ea'
      })
      var stepErr = Boom.badRequest('remove error')
      Instance.prototype.remove.yieldsAsync(stepErr)
      worker.handle(function (jobErr) {
        expect(jobErr).to.not.exist()
        sinon.assert.calledOnce(DeleteInstance.prototype._baseWorkerFindInstance)
        sinon.assert.calledWith(DeleteInstance.prototype._baseWorkerFindInstance, {_id: worker.data.instanceId})
        sinon.assert.calledOnce(DeleteInstance.prototype._handleError)
        sinon.assert.calledWith(DeleteInstance.prototype._handleError)
        expect(DeleteInstance.prototype._handleError.getCall(0).args[0]).to.equal(stepErr)
        sinon.assert.calledOnce(Instance.prototype.removeSelfFromGraph)
        sinon.assert.calledOnce(Instance.prototype.remove)
        sinon.assert.notCalled(rabbitMQ.deleteInstanceContainer)
        sinon.assert.notCalled(messenger.emitInstanceDelete)
        done()
      })
    })
    it('should fail job if deleteAllInstanceForks call failed', function (done) {
      var worker = new DeleteInstance({
        instanceId: '507f1f77bcf86cd799439011'
      })
      var inst = new Instance({
        _id: '507f1f77bcf86cd799439011',
        name: 'api',
        container: {
          dockerContainer: '6249c3a24d48fbeee444de321ee005a02c388cbaec6b900ac6693bbc7753ccd8'
        }
      })
      DeleteInstance.prototype._baseWorkerFindInstance.yieldsAsync(null, inst)
      var stepErr = new Error('Delete forks error')
      var rejectionPromise = Promise.reject(stepErr)
      rejectionPromise.suppressUnhandledRejections()
      InstanceService.deleteAllInstanceForks.returns(rejectionPromise)
      worker.handle(function (jobErr) {
        expect(jobErr).to.not.exist()
        sinon.assert.calledOnce(DeleteInstance.prototype._baseWorkerFindInstance)
        sinon.assert.calledWith(DeleteInstance.prototype._baseWorkerFindInstance, {_id: worker.data.instanceId})
        sinon.assert.calledOnce(DeleteInstance.prototype._handleError)
        sinon.assert.calledWith(DeleteInstance.prototype._handleError)
        expect(DeleteInstance.prototype._handleError.getCall(0).args[0]).to.equal(stepErr)
        sinon.assert.calledOnce(Instance.prototype.removeSelfFromGraph)
        sinon.assert.calledOnce(Instance.prototype.remove)
        sinon.assert.calledOnce(rabbitMQ.deleteInstanceContainer)
        sinon.assert.calledOnce(messenger.emitInstanceDelete)
        sinon.assert.calledWith(messenger.emitInstanceDelete, inst)
        sinon.assert.calledOnce(InstanceService.deleteAllInstanceForks)
        sinon.assert.calledWith(InstanceService.deleteAllInstanceForks, inst)
        done()
      })
    })
    it('should success if everything was successful', function (done) {
      var worker = new DeleteInstance({
        instanceId: '507f1f77bcf86cd799439011'
      })
      var instanceData = {
        _id: '507f1f77bcf86cd799439011',
        shortHash: 'a6aj1',
        name: 'api',
        masterPod: false,
        owner: {
          github: 429706
        },
        network: {
          hostIp: '10.0.1.1'
        },
        container: {
          dockerHost: 'https://localhost:4242',
          dockerContainer: '6249c3a24d48fbeee444de321ee005a02c388cbaec6b900ac6693bbc7753ccd8'
        },
        contextVersion: {
          appCodeVersions: [
            {
              lowerBranch: 'develop',
              additionalRepo: false
            }
          ]
        }
      }
      var instance = new Instance(instanceData)
      DeleteInstance.prototype._baseWorkerFindInstance.yieldsAsync(null, instance)
      worker.handle(function (jobErr) {
        expect(jobErr).to.not.exist()
        sinon.assert.calledOnce(DeleteInstance.prototype._baseWorkerFindInstance)
        sinon.assert.calledWith(DeleteInstance.prototype._baseWorkerFindInstance, {_id: worker.data.instanceId})
        sinon.assert.notCalled(DeleteInstance.prototype._handleError)
        sinon.assert.calledOnce(Instance.prototype.removeSelfFromGraph)
        sinon.assert.calledOnce(Instance.prototype.remove)
        sinon.assert.calledOnce(rabbitMQ.deleteInstanceContainer)
        var deleteContainerTask = rabbitMQ.deleteInstanceContainer.getCall(0).args[0]
        // expect(deleteContainerTask.instanceShortHash).to.equal(instanceData.shortHash)
        // expect(deleteContainerTask.instanceName).to.equal(instanceData.name)
        // expect(deleteContainerTask.instanceMasterPod).to.equal(instanceData.masterPod)
        // expect(deleteContainerTask.instanceMasterBranch)
        //   .to.equal(instanceData.contextVersion.appCodeVersions[0].lowerBranch)
        // expect(deleteContainerTask.container).to.deep.equal(instanceData.container)
        // expect(deleteContainerTask.ownerGithubId).to.equal(instanceData.owner.github)
        // expect(deleteContainerTask.sessionUserId).to.equal('507f191e810c19729de860ea')
        sinon.assert.calledOnce(messenger.emitInstanceDelete)
        sinon.assert.calledWith(messenger.emitInstanceDelete, instance)
        expect(messenger.emitInstanceDelete.callCount).to.equal(1)
        sinon.assert.calledOnce(InstanceService.deleteAllInstanceForks)
        sinon.assert.calledWith(InstanceService.deleteAllInstanceForks, instance)
        done()
      })
    })
    it('should not create container deletion job if container not specified', function (done) {
      var worker = new DeleteInstance({
        instanceId: '507f1f77bcf86cd799439011'
      })
      var instanceData = {
        _id: '507f1f77bcf86cd799439011',
        shortHash: 'a6aj1',
        name: 'api',
        masterPod: false,
        owner: {
          github: 429706
        },
        network: {
          hostIp: '10.0.1.1'
        },
        container: {
          dockerHost: 'https://localhost:4242'
        },
        contextVersion: {
          appCodeVersions: [
            {
              lowerBranch: 'develop',
              additionalRepo: false
            }
          ]
        }
      }
      var instance = new Instance(instanceData)
      DeleteInstance.prototype._baseWorkerFindInstance.yieldsAsync(null, instance)
      worker.handle(function (jobErr) {
        expect(jobErr).to.not.exist()
        sinon.assert.calledOnce(DeleteInstance.prototype._baseWorkerFindInstance)
        sinon.assert.calledWith(DeleteInstance.prototype._baseWorkerFindInstance, {_id: worker.data.instanceId})
        sinon.assert.notCalled(DeleteInstance.prototype._handleError)
        sinon.assert.calledOnce(Instance.prototype.removeSelfFromGraph)
        sinon.assert.calledOnce(Instance.prototype.remove)
        sinon.assert.notCalled(rabbitMQ.deleteInstanceContainer)
        sinon.assert.calledOnce(messenger.emitInstanceDelete)
        sinon.assert.calledWith(messenger.emitInstanceDelete, instance)
        sinon.assert.calledOnce(InstanceService.deleteAllInstanceForks)
        sinon.assert.calledWith(InstanceService.deleteAllInstanceForks, instance)
        done()
      })
    })
  })
})
