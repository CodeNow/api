/**
 * @module unit/workers/instance.delete
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = require('code').expect
var it = lab.it

var Promise = require('bluebird')
var TaskFatalError = require('ponos').TaskFatalError
var sinon = require('sinon')
require('sinon-as-promised')(Promise)

var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var IsolationService = require('models/services/isolation-service')
var Worker = require('workers/instance.delete')
var messenger = require('socket/messenger')
var rabbitMQ = require('models/rabbitmq')

describe('Instance Delete Worker', function () {
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
      sinon.stub(Instance, 'findByIdAsync').resolves(testInstance)
      sinon.stub(rabbitMQ, 'deleteInstanceContainer').returns()
      sinon.stub(Instance.prototype, 'removeSelfFromGraphAsync').resolves()
      sinon.stub(Instance.prototype, 'removeAsync').resolves()
      sinon.stub(InstanceService, 'deleteAllInstanceForks').resolves()
      sinon.stub(IsolationService, 'deleteIsolation').resolves()
      sinon.stub(messenger, 'emitInstanceDelete').returns()
      done()
    })

    afterEach(function (done) {
      Instance.findByIdAsync.restore()
      rabbitMQ.deleteInstanceContainer.restore()
      Instance.prototype.removeSelfFromGraphAsync.restore()
      Instance.prototype.removeAsync.restore()
      InstanceService.deleteAllInstanceForks.restore()
      IsolationService.deleteIsolation.restore()
      messenger.emitInstanceDelete.restore()
      done()
    })

    describe('errors', function () {
      describe('invalid Job', function () {
        it('should throw a task fatal error if the job is missing entirely', function (done) {
          Worker().asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.be.instanceOf(TaskFatalError)
            expect(err.data.validationError).to.exist()
            expect(err.data.validationError.message)
              .to.match(/job.+required/)
            done()
          })
        })

        it('should throw a task fatal error if the job is missing a instanceId', function (done) {
          Worker({}).asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.be.instanceOf(TaskFatalError)
            expect(err.data.validationError).to.exist()
            expect(err.data.validationError.message)
              .to.match(/instanceId.*required/i)
            done()
          })
        })

        it('should throw a task fatal error if the job is not an object', function (done) {
          Worker(true).asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.be.instanceOf(TaskFatalError)
            expect(err.data.validationError).to.exist()
            expect(err.data.validationError.message)
              .to.contain('must be an object')
            done()
          })
        })

        it('should throw a task fatal error if the instanceId is not a string', function (done) {
          Worker({instanceId: {}}).asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.be.instanceOf(TaskFatalError)
            expect(err.data.validationError).to.exist()
            expect(err.data.validationError.message)
              .to.match(/instanceId.*string/i)
            done()
          })
        })
      })

      it('should reject with any findById error', function (done) {
        var mongoError = new Error('Mongo failed')
        Instance.findByIdAsync.rejects(mongoError)

        Worker(testData).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(mongoError)
          done()
        })
      })

      it('should reject when instance not found with TaskFatalError', function (done) {
        Instance.findByIdAsync.resolves(null)

        Worker(testData).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.match(/instance not found/i)
          done()
        })
      })

      it('should reject with any removeSelfFromGraph error', function (done) {
        var neoError = new Error('Neo failed')
        Instance.prototype.removeSelfFromGraphAsync.rejects(neoError)

        Worker(testData).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(neoError.message)
          done()
        })
      })

      it('should reject with any delete isolation error', function (done) {
        testInstance.isolated = 'deadbeefdeadbeefdeadbeef'
        testInstance.isIsolationGroupMaster = true
        var error = new Error('pugsly')
        IsolationService.deleteIsolation.rejects(error)

        Worker(testData).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(error)
          done()
        })
      })

      it('should reject with any remove error', function (done) {
        var mongoError = new Error('Mongo failed')
        Instance.prototype.removeAsync.rejects(mongoError)

        Worker(testData).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(mongoError)
          done()
        })
      })

      it('should reject with any deleteAllInstanceForks error', function (done) {
        var mongoError = new Error('Mongo failed')
        InstanceService.deleteAllInstanceForks.rejects(mongoError)

        Worker(testData).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(mongoError)
          done()
        })
      })
    })

    it('should return no error', function (done) {
      Worker(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        done()
      })
    })

    it('should find an instance by id', function (done) {
      Worker(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.findByIdAsync)
        sinon.assert.calledWithExactly(Instance.findByIdAsync, testInstanceId)
        done()
      })
    })

    it('should remove the instance from the graph', function (done) {
      Worker(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.prototype.removeSelfFromGraphAsync)
        done()
      })
    })

    it('should delete the isolation if it is the master', function (done) {
      testInstance.isolated = 'deadbeefdeadbeefdeadbeef'
      testInstance.isIsolationGroupMaster = true

      Worker(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(IsolationService.deleteIsolation)
        sinon.assert.calledWithExactly(
          IsolationService.deleteIsolation,
          testInstance.isolated
        )
        done()
      })
    })

    it('should remove the mongo model', function (done) {
      Worker(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.prototype.removeAsync)
        done()
      })
    })

    it('should enqueue a job to remove the container', function (done) {
      Worker(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(rabbitMQ.deleteInstanceContainer)
        sinon.assert.calledWithExactly(rabbitMQ.deleteInstanceContainer, {
          instanceShortHash: testInstance.shortHash,
          instanceName: testInstance.name,
          instanceMasterPod: testInstance.masterPod,
          instanceMasterBranch: testInstance.contextVersion.appCodeVersions[0].lowerBranch,
          container: testInstance.container,
          ownerGithubId: testInstance.owner.github,
          ownerGithubUsername: testInstance.owner.username,
          isolated: testInstance.isolated,
          isIsolationGroupMaster: testInstance.isIsolationGroupMaster
        })
        done()
      })
    })

    it('should delete all instance forks', function (done) {
      Worker(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(InstanceService.deleteAllInstanceForks)
        sinon.assert.calledWithExactly(InstanceService.deleteAllInstanceForks, testInstance)
        done()
      })
    })

    it('should emit events about the instance deletion', function (done) {
      Worker(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(messenger.emitInstanceDelete)
        sinon.assert.calledWithExactly(messenger.emitInstanceDelete, testInstance)
        done()
      })
    })

    describe('no container', function () {
      beforeEach(function (done) {
        testInstance.container = null
        done()
      })

      it('should not delete container if there is no container', function (done) {
        Worker(testData).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.notCalled(rabbitMQ.deleteInstanceContainer)
          done()
        })
      })
    })

    it('should perform all these tasks in order', function (done) {
      Worker(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.callOrder(
          Instance.findByIdAsync,
          Instance.prototype.removeSelfFromGraphAsync,
          Instance.prototype.removeAsync,
          rabbitMQ.deleteInstanceContainer,
          InstanceService.deleteAllInstanceForks,
          messenger.emitInstanceDelete
        )
        done()
      })
    })
  })
})
