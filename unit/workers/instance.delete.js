/**
 * @module unit/workers/instance.container.redeploy
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')
var sinon = require('sinon')

var Promise = require('bluebird')

var rabbitMQ = require('models/rabbitmq')
var Worker = require('workers/instance.delete')
var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var messenger = require('socket/messenger')

var TaskFatalError = require('ponos').TaskFatalError
var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('InstanceDelete: ' + moduleName, function () {
  describe('worker', function () {
    var testInstanceId = '5633e9273e2b5b0c0077fd41'
    var testData = {
      instanceId: testInstanceId
    }
    var testInstance = new Instance({
      _id: testInstanceId,
      name: 'name1',
      shortHash: 'asd51a1',
      masterPod: true,
      owner: {
        github: 124,
        username: 'codenow',
        gravatar: ''
      },
      createdBy: {
        github: 125,
        username: 'runnabear',
        gravatar: ''
      },
      container: {
        dockerContainer: '46080d6253c8db55b8bbb9408654896964b86c63e863f1b3b0301057d1ad92ba'
      },
      network: {
        hostIp: '0.0.0.0'
      },
      build: '507f191e810c19729de860e2',
      contextVersion: {
        appCodeVersions: [
          {
            lowerBranch: 'develop',
            additionalRepo: false
          }
        ]
      }
    })
    beforeEach(function (done) {
      sinon.stub(Instance, 'findByIdAsync').returns(Promise.resolve(testInstance))
      sinon.stub(rabbitMQ, 'deleteInstanceContainer').returns()
      sinon.stub(Instance.prototype, 'removeSelfFromGraphAsync').returns(Promise.resolve())
      sinon.stub(Instance.prototype, 'remove').yieldsAsync()
      sinon.stub(InstanceService, 'deleteAllInstanceForks').returns(Promise.resolve())
      sinon.stub(messenger, 'emitInstanceDelete').returns()
      done()
    })

    afterEach(function (done) {
      Instance.findByIdAsync.restore()
      rabbitMQ.deleteInstanceContainer.restore()
      Instance.prototype.removeSelfFromGraphAsync.restore()
      Instance.prototype.remove.restore()
      InstanceService.deleteAllInstanceForks.restore()
      messenger.emitInstanceDelete.restore()
      done()
    })

    describe('invalid Job', function () {
      it('should throw a task fatal error if the job is missing entirely', function (done) {
        Worker().asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('Value does not exist')
          done()
        })
      })
      it('should throw a task fatal error if the job is missing a instanceId', function (done) {
        Worker({}).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('instanceId')
          expect(err.message).to.contain('required')
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
      it('should throw a task fatal error if the instanceId is not a string', function (done) {
        Worker({instanceId: {}}).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('instanceId')
          expect(err.message).to.contain('a string')
          done()
        })
      })
    })

    describe('instance lookup fails', function () {
      var mongoError = new Error('Mongo failed')
      beforeEach(function (done) {
        var rejectionPromise = Promise.reject(mongoError)
        rejectionPromise.suppressUnhandledRejections()
        Instance.findByIdAsync.returns(rejectionPromise)
        done()
      })

      it('should callback with error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.equal(mongoError.message)
            sinon.assert.calledOnce(Instance.findByIdAsync)
            sinon.assert.calledWith(Instance.findByIdAsync, testInstanceId)
            sinon.assert.notCalled(Instance.prototype.removeSelfFromGraphAsync)
            sinon.assert.notCalled(Instance.prototype.remove)
            sinon.assert.notCalled(rabbitMQ.deleteInstanceContainer)
            sinon.assert.notCalled(InstanceService.deleteAllInstanceForks)
            sinon.assert.notCalled(messenger.emitInstanceDelete)
            done()
          })
      })
    })

    describe('instance was not found', function () {
      beforeEach(function (done) {
        Instance.findByIdAsync.returns(Promise.resolve(null))
        done()
      })

      it('should callback with fatal error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err).to.be.instanceOf(TaskFatalError)
            expect(err.message).to.contain('Instance not found')
            sinon.assert.calledOnce(Instance.findByIdAsync)
            sinon.assert.calledWith(Instance.findByIdAsync, testInstanceId)
            sinon.assert.notCalled(Instance.prototype.removeSelfFromGraphAsync)
            sinon.assert.notCalled(Instance.prototype.remove)
            sinon.assert.notCalled(rabbitMQ.deleteInstanceContainer)
            sinon.assert.notCalled(InstanceService.deleteAllInstanceForks)
            sinon.assert.notCalled(messenger.emitInstanceDelete)
            done()
          })
      })
    })

    describe('removeSelfFromGraph failed', function () {
      var neoError = new Error('Neo failed')
      beforeEach(function (done) {
        var rejectionPromise = Promise.reject(neoError)
        rejectionPromise.suppressUnhandledRejections()
        Instance.prototype.removeSelfFromGraphAsync.returns(rejectionPromise)
        done()
      })

      it('should callback with fatal error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.equal(neoError.message)
            sinon.assert.calledOnce(Instance.findByIdAsync)
            sinon.assert.calledWith(Instance.findByIdAsync, testInstanceId)
            sinon.assert.calledOnce(Instance.prototype.removeSelfFromGraphAsync)
            sinon.assert.notCalled(Instance.prototype.remove)
            sinon.assert.notCalled(rabbitMQ.deleteInstanceContainer)
            sinon.assert.notCalled(InstanceService.deleteAllInstanceForks)
            sinon.assert.notCalled(messenger.emitInstanceDelete)
            done()
          })
      })
    })

    describe('remove failed', function () {
      var mongoError = new Error('Mongo failed')
      beforeEach(function (done) {
        Instance.prototype.remove.yields(mongoError)
        done()
      })

      it('should callback with fatal error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.equal(mongoError.message)
            sinon.assert.calledOnce(Instance.findByIdAsync)
            sinon.assert.calledWith(Instance.findByIdAsync, testInstanceId)
            sinon.assert.calledOnce(Instance.prototype.removeSelfFromGraphAsync)
            sinon.assert.calledOnce(Instance.prototype.remove)
            sinon.assert.notCalled(rabbitMQ.deleteInstanceContainer)
            sinon.assert.notCalled(InstanceService.deleteAllInstanceForks)
            sinon.assert.notCalled(messenger.emitInstanceDelete)
            done()
          })
      })
    })

    describe('delete forks failed', function () {
      var mongoError = new Error('Mongo failed')
      beforeEach(function (done) {
        var rejectionPromise = Promise.reject(mongoError)
        rejectionPromise.suppressUnhandledRejections()
        InstanceService.deleteAllInstanceForks.returns(rejectionPromise)
        done()
      })

      it('should callback with fatal error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.equal(mongoError.message)
            sinon.assert.calledOnce(Instance.findByIdAsync)
            sinon.assert.calledWith(Instance.findByIdAsync, testInstanceId)
            sinon.assert.calledOnce(rabbitMQ.deleteInstanceContainer)
            sinon.assert.calledOnce(Instance.prototype.removeSelfFromGraphAsync)
            sinon.assert.calledOnce(Instance.prototype.remove)
            sinon.assert.calledOnce(InstanceService.deleteAllInstanceForks)
            sinon.assert.calledWith(InstanceService.deleteAllInstanceForks, testInstance)
            sinon.assert.notCalled(messenger.emitInstanceDelete)
            done()
          })
      })
    })

    describe('pass', function () {
      it('should return no error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err).to.not.exists()
            sinon.assert.calledOnce(Instance.findByIdAsync)
            sinon.assert.calledWith(Instance.findByIdAsync, testInstanceId)
            sinon.assert.calledOnce(Instance.prototype.removeSelfFromGraphAsync)
            sinon.assert.calledOnce(Instance.prototype.remove)
            sinon.assert.calledOnce(rabbitMQ.deleteInstanceContainer)
            sinon.assert.calledWith(rabbitMQ.deleteInstanceContainer, {
              instanceShortHash: testInstance.shortHash,
              instanceName: testInstance.name,
              instanceMasterPod: testInstance.masterPod,
              instanceMasterBranch: testInstance.contextVersion.appCodeVersions[0].lowerBranch,
              container: testInstance.container,
              ownerGithubId: testInstance.owner.github,
              ownerGithubUsername: testInstance.owner.username
            })
            sinon.assert.calledOnce(InstanceService.deleteAllInstanceForks)
            sinon.assert.calledWith(InstanceService.deleteAllInstanceForks, testInstance)
            sinon.assert.calledOnce(messenger.emitInstanceDelete)
            sinon.assert.calledWith(messenger.emitInstanceDelete, testInstance)
            done()
          })
      })

      describe('no container', function () {
        beforeEach(function (done) {
          testInstance.container = null
          Instance.findByIdAsync.returns(Promise.resolve(testInstance))
          done()
        })
        it('should not delete container if there is no container', function (done) {
          Worker(testData)
            .asCallback(function (err) {
              expect(err).to.not.exists()
              sinon.assert.calledOnce(Instance.findByIdAsync)
              sinon.assert.calledWith(Instance.findByIdAsync, testInstanceId)
              sinon.assert.calledOnce(Instance.prototype.removeSelfFromGraphAsync)
              sinon.assert.calledOnce(Instance.prototype.remove)
              sinon.assert.notCalled(rabbitMQ.deleteInstanceContainer)
              sinon.assert.calledOnce(InstanceService.deleteAllInstanceForks)
              sinon.assert.calledWith(InstanceService.deleteAllInstanceForks, testInstance)
              sinon.assert.calledOnce(messenger.emitInstanceDelete)
              sinon.assert.calledWith(messenger.emitInstanceDelete, testInstance)
              done()
            })
        })
      })
      describe('not a master instance', function () {
        beforeEach(function (done) {
          testInstance.masterPod = false
          testInstance.container = null
          Instance.findByIdAsync.returns(Promise.resolve(testInstance))
          done()
        })
        it('should not mark forks if not master', function (done) {
          Worker(testData)
            .asCallback(function (err) {
              expect(err).to.not.exists()
              sinon.assert.calledOnce(Instance.findByIdAsync)
              sinon.assert.calledWith(Instance.findByIdAsync, testInstanceId)
              sinon.assert.calledOnce(Instance.prototype.removeSelfFromGraphAsync)
              sinon.assert.calledOnce(Instance.prototype.remove)
              sinon.assert.notCalled(rabbitMQ.deleteInstanceContainer)
              sinon.assert.calledOnce(InstanceService.deleteAllInstanceForks)
              sinon.assert.calledWith(InstanceService.deleteAllInstanceForks, testInstance)
              sinon.assert.calledOnce(messenger.emitInstanceDelete)
              sinon.assert.calledWith(messenger.emitInstanceDelete, testInstance)
              done()
            })
        })
      })
    })
  })
})
