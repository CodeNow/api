/**
 * @module unit/workers/instance.start
 */
'use strict'

require('sinon-as-promised')(require('bluebird'))
var Boom = require('dat-middleware').Boom
var Code = require('code')
var Lab = require('lab')
var sinon = require('sinon')
var WorkerError = require('error-cat/errors/worker-error')
var WorkerStopError = require('error-cat/errors/worker-stop-error')

var Docker = require('models/apis/docker')
var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var rabbitMQ = require('models/rabbitmq')
var Worker = require('workers/instance.start')

var lab = exports.lab = Lab.script()

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('Workers: Instance Start', function () {
  var testInstanceId = '5633e9273e2b5b0c0077fd41'
  var dockerContainer = '46080d6253c8db55b8bbb9408654896964b86c63e863f1b3b0301057d1ad92ba'
  var testSessionUserGithubId = 123123
  var testData = {
    instanceId: testInstanceId,
    containerId: dockerContainer,
    sessionUserGithubId: testSessionUserGithubId,
    tid: 'some-tid-id'
  }
  var testInstance

  beforeEach(function (done) {
    testInstance = new Instance({
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
      build: '507f191e810c19729de860e2'
    })
    sinon.stub(Instance, 'findOneStarting').resolves(testInstance)
    sinon.stub(rabbitMQ, 'instanceContainerErrored')
    sinon.stub(Docker.prototype, 'startContainerAsync').resolves()
    sinon.stub(InstanceService, 'emitInstanceUpdate').resolves()
    done()
  })

  afterEach(function (done) {
    Instance.findOneStarting.restore()
    rabbitMQ.instanceContainerErrored.restore()
    Docker.prototype.startContainerAsync.restore()
    InstanceService.emitInstanceUpdate.restore()
    done()
  })

  it('should fail if findOneStarting failed', function (done) {
    var error = new Error('Mongo error')
    Instance.findOneStarting.rejects(error)
    Worker.task(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
      done()
    })
  })
  it('should fail fatally if findOneStarting returned no instance', function (done) {
    Instance.findOneStarting.resolves(null)
    Worker.task(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err).to.be.instanceOf(WorkerStopError)
      expect(err.message).to.equal('Instance not found')
      done()
    })
  })

  it('should fail if docker startContainer failed', function (done) {
    var error = new Error('Docker error')
    Docker.prototype.startContainerAsync.rejects(error)
    Worker.task(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err).to.deep.equal(error)
      done()
    })
  })

  it('should WorkerError if docker startContainer 404', function (done) {
    Docker.prototype.startContainerAsync.rejects(Boom.create(404, 'b'))
    Worker.task(testData).asCallback(function (err) {
      expect(err).to.be.an.instanceOf(WorkerError)
      expect(err.message).to.contain('container does not exist')
      done()
    })
  })

  it('should WorkerError if docker startContainer 404', function (done) {
    Docker.prototype.startContainerAsync.rejects(Boom.create(404, 'b'))
    Worker.task(testData).asCallback(function (err) {
      expect(err).to.be.an.instanceOf(WorkerError)
      expect(err.message).to.contain('container does not exist')
      done()
    })
  })

  it('should WorkerStopError if docker startContainer 404 and past 5 min', function (done) {
    testInstance.container.inspect = {
      Created: 1
    }
    rabbitMQ.instanceContainerErrored.resolves()
    Docker.prototype.startContainerAsync.rejects(Boom.create(404, 'b'))
    Worker.task(testData).asCallback(function (err) {
      expect(err).to.be.an.instanceOf(WorkerStopError)
      expect(err.message).to.contain('Please rebuild without cache')
      done()
    })
  })

  it('should instanceContainerErrored if docker startContainer 404 and past 5 min', function (done) {
    testInstance.container.inspect = {
      Created: 1
    }
    var testError = 'Sorry, your container got lost. Please rebuild without cache'
    rabbitMQ.instanceContainerErrored.resolves()
    Docker.prototype.startContainerAsync.rejects(Boom.create(404, 'b'))
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
  it('should call findOneStarting', function (done) {
    Worker.task(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.calledOnce(Instance.findOneStarting)
      sinon.assert.calledWith(Instance.findOneStarting, testInstanceId, dockerContainer)
      done()
    })
  })

  it('should call startContainer', function (done) {
    Worker.task(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.calledOnce(Docker.prototype.startContainerAsync)
      sinon.assert.calledWith(Docker.prototype.startContainerAsync, dockerContainer)
      done()
    })
  })

  it('should call emitInstanceUpdate', function (done) {
    Worker.task(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.calledOnce(InstanceService.emitInstanceUpdate)
      sinon.assert.calledWith(InstanceService.emitInstanceUpdate, testInstance, testSessionUserGithubId, 'starting', true)
      done()
    })
  })

  it('should call out to various models and helper methods in the correct order', function (done) {
    Worker.task(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.callOrder(
        Instance.findOneStarting,
        InstanceService.emitInstanceUpdate,
        Docker.prototype.startContainerAsync)
      done()
    })
  })
})
