/**
 * @module unit/workers/instance.stop
 */
'use strict'

require('sinon-as-promised')(require('bluebird'))
var Boom = require('dat-middleware').Boom
var Code = require('code')
var Lab = require('lab')
var sinon = require('sinon')
var WorkerStopError = require('error-cat/errors/worker-stop-error')

var Docker = require('models/apis/docker')
var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var rabbitMQ = require('models/rabbitmq')
var Worker = require('workers/instance.stop')

var lab = exports.lab = Lab.script()

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('Workers: Instance Stop', function () {
  var testInstanceId = '5633e9273e2b5b0c0077fd41'
  var dockerContainer = '46080d6253c8db55b8bbb9408654896964b86c63e863f1b3b0301057d1ad92ba'
  var testSessionUserGithubId = 123123
  var testData = {
    instanceId: testInstanceId,
    containerId: dockerContainer,
    sessionUserGithubId: testSessionUserGithubId
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
    sinon.stub(Docker.prototype, 'stopContainerAsync').resolves()
    sinon.stub(InstanceService, 'emitInstanceUpdate').resolves()
    sinon.stub(rabbitMQ, 'instanceContainerErrored')
    done()
  })

  afterEach(function (done) {
    Instance.findOneStoppingAsync.restore()
    Docker.prototype.stopContainerAsync.restore()
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
  it('should fail if docker stopContainer failed', function (done) {
    var error = new Error('Docker error')
    Docker.prototype.stopContainerAsync.rejects(error)
    Worker.task(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
      done()
    })
  })

  it('should WorkerStopError if docker startContainer 404', function (done) {
    Docker.prototype.stopContainerAsync.rejects(Boom.create(404, 'b'))
    Worker.task(testData).asCallback(function (err) {
      expect(err).to.be.an.instanceOf(WorkerStopError)
      expect(err.message).to.contain('Sorry, your container got lost. Please rebuild without cache')
      done()
    })
  })

  it('should instanceContainerErrored if docker stopContainer 404', function (done) {
    testInstance.container.inspect = {
      Created: 1
    }
    var testError = 'Sorry, your container got lost. Please rebuild without cache'
    rabbitMQ.instanceContainerErrored.resolves()
    Docker.prototype.stopContainerAsync.rejects(Boom.create(404, 'b'))
    Worker.task(testData).asCallback(function (err) {
      expect(err).to.be.an.instanceOf(WorkerStopError)
      expect(err.message).to.contain('Please rebuild without cache')
      sinon.assert.calledOnce(rabbitMQ.instanceContainerErrored)
      sinon.assert.calledWith(rabbitMQ.instanceContainerErrored, {
        instanceId: testData.instanceId,
        containerId: testData.containerId,
        error: testError
      })
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
  it('should call stopContainer', function (done) {
    Worker.task(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.calledOnce(Docker.prototype.stopContainerAsync)
      sinon.assert.calledWith(Docker.prototype.stopContainerAsync, dockerContainer)
      done()
    })
  })
  it('should call emitInstanceUpdate', function (done) {
    Worker.task(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.calledOnce(InstanceService.emitInstanceUpdate)
      sinon.assert.calledWith(InstanceService.emitInstanceUpdate, testInstance, testSessionUserGithubId, 'stopping', true)
      done()
    })
  })
  it('should call out to various models and helper methods in the correct order', function (done) {
    Worker.task(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.callOrder(
        Instance.findOneStoppingAsync,
        InstanceService.emitInstanceUpdate,
        Docker.prototype.stopContainerAsync)
      done()
    })
  })

  it('should emit instance errored on final retry', (done) => {
    Worker.finalRetryFn(testData).asCallback(function (err) {
      if (err) { return done(err) }
      sinon.assert.calledOnce(rabbitMQ.instanceContainerErrored)
      sinon.assert.calledWith(rabbitMQ.instanceContainerErrored, {
        instanceId: testData.instanceId,
        containerId: testData.containerId,
        error: new Error('Could not stop instance')
      })
      done()
    })
  })
})
