/**
 * @module unit/workers/instance.fork
 */
'use strict'
const Code = require('code')
const Lab = require('lab')
const sinon = require('sinon')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

const Instance = require('models/mongo/instance')
const InstanceService = require('models/services/instance-service')
const InstanceForkService = require('models/services/instance-fork-service')
const IsolationService = require('models/services/isolation-service')
const Worker = require('workers/instance.fork')

require('sinon-as-promised')(require('bluebird'))
const lab = exports.lab = Lab.script()

const afterEach = lab.afterEach
const beforeEach = lab.beforeEach
const describe = lab.describe
const expect = Code.expect
const it = lab.it

const testInstanceId = '5633e9273e2b5b0c0077fd41'
const dockerContainer = '46080d6253c8db55b8bbb9408654896964b86c63e863f1b3b0301057d1ad92ba'
describe('Workers: Instance Fork', function () {
  let testInstance
  let pushInfo
  let testData = {}
  describe('task', function () {
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
    pushInfo = { user: { id: 2 } }
    testData = {
      instance: testInstance,
      pushInfo: pushInfo
    }

    beforeEach(function (done) {
      sinon.stub(InstanceService, 'findInstance').resolves(testInstance)
      sinon.stub(InstanceForkService, 'autoFork').resolves(testInstance)
      sinon.stub(IsolationService, 'autoIsolate').resolves(testInstance)
      done()
    })

    afterEach(function (done) {
      InstanceService.findInstance.restore()
      InstanceForkService.autoFork.restore()
      IsolationService.autoIsolate.restore()
      done()
    })

    it('should fail fatally if findInstance threw no instance error', function (done) {
      InstanceService.findInstance.rejects(new Instance.NotFoundError('Hey'))
      Worker.task(testData).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.instanceOf(WorkerStopError)
        expect(err.message).to.equal('Instance not found')
        done()
      })
    })

    it('should fetch the instance by the shortHash', function (done) {
      Worker.task(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(InstanceService.findInstance)
        sinon.assert.calledWith(InstanceService.findInstance, testInstance.shortHash)
        done()
      })
    })

    it('should fork the instance the instance found', function (done) {
      Worker.task(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(InstanceForkService.autoFork)
        sinon.assert.calledWith(InstanceForkService.autoFork, testInstance, pushInfo)
        done()
      })
    })
    it('should isolate the forked instance', function (done) {
      const forkedInstance = {}
      InstanceForkService.autoFork.resolves(forkedInstance)
      Worker.task(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(IsolationService.autoIsolate)
        sinon.assert.calledWith(IsolationService.autoIsolate, forkedInstance, pushInfo)
        done()
      })
    })
  })
})
