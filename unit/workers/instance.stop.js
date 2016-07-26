/**
 * @module unit/workers/instance.stop
 */
'use strict'

require('sinon-as-promised')(require('bluebird'))
var Boom = require('dat-middleware').Boom
var Code = require('code')
var Lab = require('lab')
var omit = require('101/omit')
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

var Docker = require('models/apis/docker')
var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
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
    done()
  })

  afterEach(function (done) {
    Instance.findOneStoppingAsync.restore()
    Docker.prototype.stopContainerAsync.restore()
    InstanceService.emitInstanceUpdate.restore()
    done()
  })

  describe('validation', function () {
    it('should fatally fail if job is null', function (done) {
      Worker(null).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.an.instanceOf(TaskFatalError)
        expect(err.message).to.equal('instance.stop: Invalid Job')
        done()
      })
    })
    it('should fatally fail if job is {}', function (done) {
      Worker({}).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.an.instanceOf(TaskFatalError)
        expect(err.message).to.equal('instance.stop: Invalid Job')
        done()
      })
    })
    it('should fatally fail if job has no instanceId', function (done) {
      var data = omit(testData, 'instanceId')
      Worker(data).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.an.instanceOf(TaskFatalError)
        expect(err.message).to.equal('instance.stop: Invalid Job')
        done()
      })
    })
    it('should fatally fail if job has no containerId', function (done) {
      var data = omit(testData, 'containerId')
      Worker(data).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.an.instanceOf(TaskFatalError)
        expect(err.message).to.equal('instance.stop: Invalid Job')
        done()
      })
    })
    it('should fatally fail if job has no sessionUserGithubId', function (done) {
      var data = omit(testData, 'sessionUserGithubId')
      Worker(data).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.an.instanceOf(TaskFatalError)
        expect(err.message).to.equal('instance.stop: Invalid Job')
        done()
      })
    })
  })
  it('should fail if findOneStoppingAsync failed', function (done) {
    var error = new Error('Mongo error')
    Instance.findOneStoppingAsync.rejects(error)
    Worker(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
      done()
    })
  })
  it('should fail fatally if findOneStoppingAsync returned no instance', function (done) {
    Instance.findOneStoppingAsync.resolves(null)
    Worker(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err).to.be.instanceOf(TaskFatalError)
      expect(err.message).to.equal('instance.stop: Instance not found')
      done()
    })
  })
  it('should fail if docker stopContainer failed', function (done) {
    var error = new Error('Docker error')
    Docker.prototype.stopContainerAsync.rejects(error)
    Worker(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
      done()
    })
  })

  it('should TaskFatalError if docker startContainer 404', function (done) {
    Docker.prototype.stopContainerAsync.rejects(Boom.create(404, 'b'))
    Worker(testData).asCallback(function (err) {
      expect(err).to.be.an.instanceOf(TaskFatalError)
      expect(err.message).to.contain('container does not exist')
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
  it('should call findOneStoppingAsync', function (done) {
    Worker(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.calledOnce(Instance.findOneStoppingAsync)
      sinon.assert.calledWith(Instance.findOneStoppingAsync, testInstanceId, dockerContainer)
      done()
    })
  })
  it('should call stopContainer', function (done) {
    Worker(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.calledOnce(Docker.prototype.stopContainerAsync)
      sinon.assert.calledWith(Docker.prototype.stopContainerAsync, dockerContainer)
      done()
    })
  })
  it('should call emitInstanceUpdate', function (done) {
    Worker(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.calledOnce(InstanceService.emitInstanceUpdate)
      sinon.assert.calledWith(InstanceService.emitInstanceUpdate, testInstance, testSessionUserGithubId, 'stopping', true)
      done()
    })
  })
  it('should call out to various models and helper methods in the correct order', function (done) {
    Worker(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.callOrder(
        Instance.findOneStoppingAsync,
        InstanceService.emitInstanceUpdate,
        Docker.prototype.stopContainerAsync)
      done()
    })
  })
})
