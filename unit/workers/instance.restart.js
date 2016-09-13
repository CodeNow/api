/**
 * @module unit/workers/instance.restart
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')
var sinon = require('sinon')
require('sinon-as-promised')(require('bluebird'))

var Docker = require('models/apis/docker')
var Worker = require('workers/instance.restart')
var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')

var WorkerStopError = require('error-cat/errors/worker-stop-error')
var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('Workers: Instance Restart', function () {
  var testInstanceId = '5633e9273e2b5b0c0077fd41'
  var dockerContainer = '46080d6253c8db55b8bbb9408654896964b86c63e863f1b3b0301057d1ad92ba'
  var testSessionUserGithubId = 123123
  var testCvId = '507f191e810c19729de860ea'
  var testData = {
    instanceId: testInstanceId,
    containerId: dockerContainer,
    sessionUserGithubId: testSessionUserGithubId,
    tid: 'some-tid-id'
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
      _id: testCvId,
      appCodeVersions: [
        {
          lowerBranch: 'develop',
          additionalRepo: false
        }
      ]
    }
  })
  beforeEach(function (done) {
    sinon.stub(Instance, 'findOneStarting').resolves(testInstance)
    sinon.stub(Docker.prototype, 'restartContainerAsync').resolves()
    sinon.stub(InstanceService, 'emitInstanceUpdate').resolves()
    done()
  })

  afterEach(function (done) {
    Instance.findOneStarting.restore()
    Docker.prototype.restartContainerAsync.restore()
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
  it('should fail if docker restartContainer failed', function (done) {
    var error = new Error('Docker error')
    Docker.prototype.restartContainerAsync.rejects(error)
    Worker.task(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
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
  it('should call restartContainer', function (done) {
    Worker.task(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.calledOnce(Docker.prototype.restartContainerAsync)
      sinon.assert.calledWith(Docker.prototype.restartContainerAsync, dockerContainer)
      done()
    })
  })
  it('should call emitInstanceUpdate', function (done) {
    Worker.task(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.calledOnce(InstanceService.emitInstanceUpdate)
      sinon.assert.calledWith(InstanceService.emitInstanceUpdate, testInstance, testSessionUserGithubId, 'restart', true)
      done()
    })
  })
  it('should call out to various models and helper methods in the correct order', function (done) {
    Worker.task(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.callOrder(
        Instance.findOneStarting,
        Docker.prototype.restartContainerAsync,
        InstanceService.emitInstanceUpdate)
      done()
    })
  })
})
