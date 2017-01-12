/**
 * @module unit/workers/instance.auto-deploy
 */
'use strict'

require('sinon-as-promised')(require('bluebird'))
var Code = require('code')
var Lab = require('lab')
var sinon = require('sinon')
var WorkerStopError = require('error-cat/errors/worker-stop-error')

var BuildService = require('models/services/build-service')
var Docker = require('models/apis/docker')
var Instance = require('models/mongo/instance')
var Worker = require('workers/instance.auto-deploy')

var lab = exports.lab = Lab.script()

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('Workers: Instance Auto Deploy', function () {
  var testInstanceId = '5633e9273e2b5b0c0077fd41'
  var dockerContainer = '46080d6253c8db55b8bbb9408654896964b86c63e863f1b3b0301057d1ad92ba'
  const user = {
    id: 123,
    login: 'user'
  }
  const githubPushInfo = {
    repo: user.login + '/repo',
    branch: 'branch',
    commit: 'asdasdsad',
    user: user
  }
  var testInstance
  const job = {
    instanceId: testInstanceId,
    pushInfo: githubPushInfo
  }


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
    sinon.stub(Instance, 'findByIdAsync').resolves(testInstance)
    sinon.stub(BuildService, 'createAndBuildContextVersion').resolves()
    done()
  })

  afterEach(function (done) {
    Instance.findByIdAsync.restore()
    BuildService.createAndBuildContextVersion.restore()
    done()
  })

  it('should fail if findByIdAsync failed', function (done) {
    var error = new Error('Mongo error')
    Instance.findByIdAsync.rejects(error)
    return Worker.task(job)
      .asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal(error.message)
        done()
      })
  })

  it('should worker stop if findOneStarting returned no instance', function (done) {
    Instance.findByIdAsync.resolves(null)
    return Worker.task(job)
      .asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.instanceOf(WorkerStopError)
        expect(err.message).to.equal('Instance not found')
        done()
      })
  })

  it('should fail if BuildService createAndBuildContextVersion failed', function (done) {
    var error = new Error('Docker error')
    BuildService.createAndBuildContextVersion.rejects(error)
    return Worker.task(job)
      .asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.equal(error)
        done()
      })
  })

  it('should call createAndBuildContextVersion with instance and pushInfo', function (done) {
    return Worker.task(job)
      .asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(BuildService.createAndBuildContextVersion)
        sinon.assert.calledWith(BuildService.createAndBuildContextVersion, testInstance, githubPushInfo)
        done()
      })
  })
})
