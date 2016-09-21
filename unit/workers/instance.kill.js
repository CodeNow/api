/**
 * @module unit/workers/instance.kill
 */
'use strict'
var Boom = require('dat-middleware').Boom
var Code = require('code')
var Lab = require('lab')
var sinon = require('sinon')
var WorkerStopError = require('error-cat/errors/worker-stop-error')

var Docker = require('models/apis/docker')
var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var rabbitMQ = require('models/rabbitmq')
var Worker = require('workers/instance.kill')

require('sinon-as-promised')(require('bluebird'))
var lab = exports.lab = Lab.script()

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('Workers: Instance Kill', function () {
  var testInstanceId = '5633e9273e2b5b0c0077fd41'
  var dockerContainer = '46080d6253c8db55b8bbb9408654896964b86c63e863f1b3b0301057d1ad92ba'
  var testData = {
    instanceId: testInstanceId,
    containerId: dockerContainer
  }
  describe('task', function () {
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
        dockerContainer: dockerContainer
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
      sinon.stub(Instance, 'findOneStoppingAsync').resolves(testInstance)
      sinon.stub(Docker.prototype, 'killContainerAsync').resolves()
      sinon.stub(InstanceService, 'emitInstanceUpdate').resolves()
      sinon.stub(rabbitMQ, 'instanceContainerErrored')
      done()
    })

    afterEach(function (done) {
      Instance.findOneStoppingAsync.restore()
      Docker.prototype.killContainerAsync.restore()
      InstanceService.emitInstanceUpdate.restore()
      rabbitMQ.instanceContainerErrored.restore()
      done()
    })

    it('should fail if findOneStoppingAsync failed', function (done) {
      var error = new Error('Mongo error')
      Instance.findOneStoppingAsync.rejects(error)
      Worker.task(testData).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal(error.message)
        done()
      })
    })

    it('should fail fatally if findOneStoppingAsync returned no instance', function (done) {
      Instance.findOneStoppingAsync.resolves(null)
      Worker.task(testData).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.instanceOf(WorkerStopError)
        expect(err.message).to.equal('Instance not found')
        done()
      })
    })

    it('should send rabbit event if stop error', function (done) {
      Instance.findOneStoppingAsync.resolves(null)
      Worker.task(testData).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.instanceOf(WorkerStopError)
        sinon.assert.calledOnce(rabbitMQ.instanceContainerErrored)
        sinon.assert.calledWith(rabbitMQ.instanceContainerErrored, {
          instanceId: testData.instanceId,
          containerId: testData.containerId,
          error: err.message
        })

        done()
      })
    })

    it('should fail if docker killContainer failed', function (done) {
      var error = new Error('Docker error')
      Docker.prototype.killContainerAsync.rejects(error)
      Worker.task(testData).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal(error.message)
        done()
      })
    })

    it('should fail fatally if docker container is not running', function (done) {
      var error = Boom.create(500, 'Container 31231232 is not running')
      Docker.prototype.killContainerAsync.rejects(error)
      Worker.task(testData).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.instanceOf(WorkerStopError)
        expect(err.message).to.equal('Container is not running')
        done()
      })
    })

    it('should fail if sending events failed', function (done) {
      var error = new Error('Primus error')
      InstanceService.emitInstanceUpdate.rejects(error)
      Worker.task(testData).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal(error.message)
        done()
      })
    })

    it('should call findOneStoppingAsync', function (done) {
      Worker.task(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.findOneStoppingAsync)
        sinon.assert.calledWith(Instance.findOneStoppingAsync, testInstanceId, dockerContainer)
        done()
      })
    })

    it('should call killContainer', function (done) {
      Worker.task(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Docker.prototype.killContainerAsync)
        sinon.assert.calledWith(Docker.prototype.killContainerAsync, dockerContainer)
        done()
      })
    })

    it('should call emitInstanceUpdate', function (done) {
      Worker.task(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(InstanceService.emitInstanceUpdate)
        sinon.assert.calledWith(InstanceService.emitInstanceUpdate, testInstance, null, 'stopping')
        done()
      })
    })

    it('should call out to various models and helper methods in the correct order', function (done) {
      Worker.task(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.callOrder(
          Instance.findOneStoppingAsync,
          InstanceService.emitInstanceUpdate,
          Docker.prototype.killContainerAsync)
        done()
      })
    })
  }) // end task

  describe('finalRetryFn', function () {
    beforeEach(function (done) {
      sinon.stub(rabbitMQ, 'instanceContainerErrored')
      done()
    })

    afterEach(function (done) {
      rabbitMQ.instanceContainerErrored.restore()
      done()
    })

    it('should send rabbit event if stop error', function (done) {
      Worker.finalRetryFn(testData).asCallback(function (err) {
        if (err) { return done(err) }
        sinon.assert.calledOnce(rabbitMQ.instanceContainerErrored)
        sinon.assert.calledWith(rabbitMQ.instanceContainerErrored, {
          instanceId: testData.instanceId,
          containerId: testData.containerId,
          error: 'failed to kill instance.'
        })

        done()
      })
    })
  }) // end finalRetryFn
})
