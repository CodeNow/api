/**
 * @module unit/workers/instance.stop
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var omit = require('101/omit')
var Code = require('code')
var sinon = require('sinon')
require('sinon-as-promised')(require('bluebird'))

var Docker = require('models/apis/docker')
var Worker = require('workers/instance.stop')
var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')

var TaskFatalError = require('ponos').TaskFatalError
var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('InstanceStop: ' + moduleName, function () {
  var testInstanceId = '5633e9273e2b5b0c0077fd41'
  var dockerContainer = '46080d6253c8db55b8bbb9408654896964b86c63e863f1b3b0301057d1ad92ba'
  var testData = {
    instanceId: testInstanceId,
    containerId: dockerContainer,
    sessionUserGithubId: 123123
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
    sinon.stub(Instance, 'markAsStoppingAsync').resolves(testInstance)
    sinon.stub(Docker.prototype, 'stopContainer').yieldsAsync()
    sinon.stub(InstanceService, 'emitInstanceUpdate').resolves()
    done()
  })

  afterEach(function (done) {
    Instance.markAsStoppingAsync.restore()
    Docker.prototype.stopContainer.restore()
    InstanceService.emitInstanceUpdate.restore()
    done()
  })

  describe('validation', function () {
    it('should fail if payload is null', function (done) {
      Worker(null).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal('instance.stop: Invalid Job')
        done()
      })
    })
    it('should fail if payload is {}', function (done) {
      Worker(null).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal('instance.stop: Invalid Job')
        done()
      })
    })
    it('should fail if payload is {}', function (done) {
      Worker(null).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal('instance.stop: Invalid Job')
        done()
      })
    })
    it('should fail if payload has no instanceId', function (done) {
      var data = omit(testData, 'instanceId')
      Worker(data).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal('instance.stop: Invalid Job')
        done()
      })
    })
    it('should fail if payload has no containerId', function (done) {
      var data = omit(testData, 'containerId')
      Worker(data).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal('instance.stop: Invalid Job')
        done()
      })
    })
    it('should fail if payload has no sessionUserGithubId', function (done) {
      var data = omit(testData, 'sessionUserGithubId')
      Worker(data).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal('instance.stop: Invalid Job')
        done()
      })
    })
  })
  it('should fail if markAsStoppingAsync failed', function (done) {
    var error = new Error('Mongo error')
    Instance.markAsStoppingAsync.rejects(error)
    Worker(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
      done()
    })
  })
  it('should fail fatally if markAsStoppingAsync returned no instance', function (done) {
    Instance.markAsStoppingAsync.resolves(null)
    Worker(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err).to.be.instanceOf(TaskFatalError)
      expect(err.message).to.equal('instance.stop: Instance not found')
      done()
    })
  })
  it('should fail if docker stopContainer failed', function (done) {
    var error = new Error('Docker error')
    Docker.prototype.stopContainer.yieldsAsync(error)
    Worker(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
      done()
    })
  })
  it('should fail if sending events failed', function (done) {
    var error = new Error('Primus error')
    InstanceService.emitInstanceUpdate.rejects(error)
    Worker(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
      done()
    })
  })
  it('should return no error if success', function (done) {
    Worker(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.calledOnce(Instance.markAsStoppingAsync)
      sinon.assert.calledWith(Instance.markAsStoppingAsync, testInstanceId, dockerContainer)
      sinon.assert.calledOnce(Docker.prototype.stopContainer)
      sinon.assert.calledWith(Docker.prototype.stopContainer, dockerContainer)
      sinon.assert.calledOnce(InstanceService.emitInstanceUpdate)
      sinon.assert.calledWith(InstanceService.emitInstanceUpdate,
        testInstance,
        testData.sessionUserGithubId,
        'stopping',
        true)
      sinon.assert.callOrder(
        Instance.markAsStoppingAsync,
        Docker.prototype.stopContainer,
        InstanceService.emitInstanceUpdate)
      done()
    })
  })
})
