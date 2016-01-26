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
  var testTarget = 'goku'
  var testHost = 'http://' + testTarget + ':4242'
  var testData = {
    host: testHost
  }

  describe('worker', function () {
    beforeEach(function (done) {
      sinon.stub(Instance, 'findInstancesBuiltButNotStoppedOrCrashedByDockerHostAsync')
      sinon.stub(ContextVersion, 'markDockRemovedByDockerHost').yieldsAsync()
      sinon.stub(Instance, 'setStoppingAsStoppedByDockerHost').yieldsAsync()
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

      Instance.findInstancesBuiltButNotStoppedOrCrashedByDockerHostAsync.restore()
      ContextVersion.markDockRemovedByDockerHost.restore()
      Instance.setStoppingAsStoppedByDockerHost.restore()
      rabbitMQ.asgInstanceTerminate.restore()
      done()
    })

    describe('invalid Job', function () {
      it('should throw a task fatal error if the job is missing a dockerhost', function (done) {
        Worker({}).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.match(/job failed validation/i)
          expect(err.data.err.message).to.contain('host')
          expect(err.data.err.message).to.contain('required')
          sinon.assert.notCalled(rabbitMQ.asgInstanceTerminate)
          done()
        })
      })
      it('should throw a task fatal error if the job is missing a dockerhost', function (done) {
        Worker({host: {}}).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.match(/job failed validation/i)
          expect(err.data.err.message).to.contain('host')
          expect(err.data.err.message).to.contain('a string')
          sinon.assert.notCalled(rabbitMQ.asgInstanceTerminate)
          done()
        })
      })
      it('should throw a task fatal error if foul dockerhost', function (done) {
        Worker({host: 'foul'}).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.match(/job failed validation/i)
          expect(err.data.err.message).to.contain('host')
          expect(err.data.err.message).to.contain('must be a valid uri')
          sinon.assert.notCalled(rabbitMQ.asgInstanceTerminate)
          done()
        })
      })
      it('should throw a task fatal error if the job is missing entirely', function (done) {
        Worker().asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.match(/job failed validation/i)
          sinon.assert.notCalled(rabbitMQ.asgInstanceTerminate)
          done()
        })
      })
      it('should throw a task fatal error if the job is not an object', function (done) {
        Worker(true).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.match(/job failed validation/i)
          expect(err.data.err.message).to.contain('must be an object')
          sinon.assert.notCalled(rabbitMQ.asgInstanceTerminate)
          done()
        })
      })
    })

    describe('ContextVersion.markDockRemovedByDockerHost returns error', function () {
      var testError = new Error('Mongo error')
      beforeEach(function (done) {
        ContextVersion.markDockRemovedByDockerHost.yieldsAsync(testError)
        done()
      })

      it('should error', function (done) {
        Worker(testData).asCallback(function (err) {
          expect(err.message).to.equal(testError.message)
          sinon.assert.calledOnce(ContextVersion.markDockRemovedByDockerHost)
          sinon.assert.calledWith(ContextVersion.markDockRemovedByDockerHost, testHost)
          sinon.assert.notCalled(Instance.setStoppingAsStoppedByDockerHost)
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

    describe('Instance.setStoppingAsStoppedByDockerHost returns error', function () {
      var testError = new Error('Mongo error')
      beforeEach(function (done) {
        ContextVersion.markDockRemovedByDockerHost.yieldsAsync(null)
        Instance.setStoppingAsStoppedByDockerHost.yieldsAsync(testError)

        Worker._redeploy.returns(Promise.resolve())
        Worker._rebuild.returns(Promise.resolve())
        Worker._updateFrontendInstances.returns(Promise.resolve())
        done()
      })

      it('should error', function (done) {
        Worker(testData).asCallback(function (err) {
          expect(err.message).to.equal(testError.message)
          sinon.assert.calledOnce(ContextVersion.markDockRemovedByDockerHost)
          sinon.assert.calledWith(ContextVersion.markDockRemovedByDockerHost, testHost)
          sinon.assert.calledOnce(Instance.setStoppingAsStoppedByDockerHost)
          sinon.assert.calledWith(Instance.setStoppingAsStoppedByDockerHost, testHost)
          sinon.assert.calledOnce(Worker._redeploy)
          sinon.assert.calledOnce(Worker._rebuild)
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
        ContextVersion.markDockRemovedByDockerHost.yieldsAsync(null)
        Instance.setStoppingAsStoppedByDockerHost.yieldsAsync(null)
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
          sinon.assert.calledOnce(Instance.setStoppingAsStoppedByDockerHost)
          sinon.assert.calledWith(Instance.setStoppingAsStoppedByDockerHost, testHost)
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
        ContextVersion.markDockRemovedByDockerHost.yieldsAsync(null)
        Instance.setStoppingAsStoppedByDockerHost.yieldsAsync(null)
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
          sinon.assert.calledOnce(Instance.setStoppingAsStoppedByDockerHost)
          sinon.assert.calledWith(Instance.setStoppingAsStoppedByDockerHost, testHost)
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
        ContextVersion.markDockRemovedByDockerHost.yieldsAsync(null)
        Instance.setStoppingAsStoppedByDockerHost.yieldsAsync(null)
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
          sinon.assert.calledOnce(Instance.setStoppingAsStoppedByDockerHost)
          sinon.assert.calledWith(Instance.setStoppingAsStoppedByDockerHost, testHost)
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
        ContextVersion.markDockRemovedByDockerHost.yieldsAsync(null)
        Instance.setStoppingAsStoppedByDockerHost.yieldsAsync(null)
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
          sinon.assert.calledOnce(Instance.setStoppingAsStoppedByDockerHost)
          sinon.assert.calledWith(Instance.setStoppingAsStoppedByDockerHost, testHost)
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
        ContextVersion.markDockRemovedByDockerHost.yieldsAsync(null)
        Instance.setStoppingAsStoppedByDockerHost.yieldsAsync(null)
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
          sinon.assert.calledOnce(Instance.setStoppingAsStoppedByDockerHost)
          sinon.assert.calledWith(Instance.setStoppingAsStoppedByDockerHost, testHost)
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

  describe('#_redeployContainers', function () {
    // we are not going to validate instances that should be redeployed at this point
    var instances = [{
      _id: '1',
      container: {
        inspect: {
          dockerContainer: '1b6cf020fad3b86762e66287babee95d54b787d16bec493cae4a2df7e036a036',
          State: {
            Running: true
          }
        }
      }
    }, {
      _id: '2',
      container: {
        inspect: {
          dockerContainer: '2b6cf020fad3b86762e66287babee95d54b787d16bec493cae4a2df7e036a036',
          State: {
            Running: false
          }
        }
      }
    }, {
      _id: '3',
      container: {
        inspect: {
          dockerContainer: '3b6cf020fad3b86762e66287babee95d54b787d16bec493cae4a2df7e036a036',
          State: {
            Running: true
          }
        }
      }
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
      expect(rabbitMQ.redeployInstanceContainer.callCount).to.equal(3)
      var call1 = rabbitMQ.redeployInstanceContainer.getCall(0).args
      expect(call1[0]).to.deep.equal({
        instanceId: instances[0]._id,
        sessionUserGithubId: process.env.HELLO_RUNNABLE_GITHUB_ID
      })
      var call2 = rabbitMQ.redeployInstanceContainer.getCall(1).args
      expect(call2[0]).to.deep.equal({
        instanceId: instances[1]._id,
        sessionUserGithubId: process.env.HELLO_RUNNABLE_GITHUB_ID
      })
      var call3 = rabbitMQ.redeployInstanceContainer.getCall(2).args
      expect(call3[0]).to.deep.equal({
        instanceId: instances[2]._id,
        sessionUserGithubId: process.env.HELLO_RUNNABLE_GITHUB_ID
      })
      done()
    })
  }) // end _redeployContainers

  describe('#_rebuildInstances', function () {
    beforeEach(function (done) {
      sinon.stub(rabbitMQ, 'publishInstanceRebuild')
      done()
    })

    afterEach(function (done) {
      rabbitMQ.publishInstanceRebuild.restore()
      done()
    })

    it('should publish job for each instance', function (done) {
      var instances = [
        {_id: '1', build: { completed: true, failed: false }},
        {_id: '2', build: { completed: false, failed: false }}
      ]
      Worker._rebuildInstances(instances)
      sinon.assert.calledTwice(rabbitMQ.publishInstanceRebuild)
      expect(rabbitMQ.publishInstanceRebuild.getCall(0).args[0].instanceId).to.equal('1')
      expect(rabbitMQ.publishInstanceRebuild.getCall(1).args[0].instanceId).to.equal('2')
      done()
    })
    it('should not publish jobs if nothing was passed', function (done) {
      var instances = []
      Worker._rebuildInstances(instances)
      sinon.assert.notCalled(rabbitMQ.publishInstanceRebuild)
      done()
    })
  })

  describe('#_redeploy', function () {
    var testErr = new Error('Mongo erro')
    var testData = {
      host: 'http://10.12.12.14:4242'
    }
    beforeEach(function (done) {
      sinon.stub(Instance, 'findInstancesBuiltButNotStoppedOrCrashedByDockerHostAsync')
      sinon.stub(Worker, '_redeployContainers').returns()
      done()
    })

    afterEach(function (done) {
      Instance.findInstancesBuiltButNotStoppedOrCrashedByDockerHostAsync.restore()
      Worker._redeployContainers.restore()
      done()
    })

    describe('#findInstancesBuiltButNotStoppedOrCrashedByDockerHostAsync fails', function () {
      beforeEach(function (done) {
        var promise = Promise.reject(testErr)
        promise.suppressUnhandledRejections()
        Instance.findInstancesBuiltButNotStoppedOrCrashedByDockerHostAsync.returns(promise)
        done()
      })

      it('should callback with error', function (done) {
        Worker._redeploy(testData)
          .asCallback(function (err) {
            expect(err.message).to.equal(testErr.message)
            sinon.assert.calledOnce(Instance.findInstancesBuiltButNotStoppedOrCrashedByDockerHostAsync)
            sinon.assert.calledWith(Instance.findInstancesBuiltButNotStoppedOrCrashedByDockerHostAsync, testData.host)
            done()
          })
      })
    })

    describe('#findInstancesBuiltButNotStoppedOrCrashedByDockerHostAsync returns 2 instances', function () {
      var instances = [
        { _id: '1' },
        { _id: '2' }
      ]
      beforeEach(function (done) {
        Instance.findInstancesBuiltButNotStoppedOrCrashedByDockerHostAsync.returns(Promise.resolve(instances))
        done()
      })

      it('should return successfully', function (done) {
        Worker._redeploy(testData)
          .asCallback(function (err) {
            expect(err).to.not.exist()
            sinon.assert.calledOnce(Instance.findInstancesBuiltButNotStoppedOrCrashedByDockerHostAsync)
            sinon.assert.calledWith(Instance.findInstancesBuiltButNotStoppedOrCrashedByDockerHostAsync, testData.host)
            sinon.assert.calledOnce(Worker._redeployContainers)
            sinon.assert.calledWith(Worker._redeployContainers, instances)
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
      sinon.stub(Worker, '_rebuildInstances').returns()
      done()
    })

    afterEach(function (done) {
      Instance.findInstancesBuildingOnDockerHost.restore()
      Worker._rebuildInstances.restore()
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
        { _id: '1' },
        { _id: '2' }
      ]
      beforeEach(function (done) {
        Instance.findInstancesBuildingOnDockerHost.yieldsAsync(null, instances)
        done()
      })

      it('should return successfully', function (done) {
        Worker._rebuild(testData)
          .asCallback(function (err) {
            expect(err).to.not.exist()
            sinon.assert.calledOnce(Instance.findInstancesBuildingOnDockerHost)
            sinon.assert.calledWith(Instance.findInstancesBuildingOnDockerHost, testData.host)
            sinon.assert.calledOnce(Worker._rebuildInstances)
            sinon.assert.calledWith(Worker._rebuildInstances, instances)
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
