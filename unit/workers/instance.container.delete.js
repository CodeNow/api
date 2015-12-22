/**
 * @module unit/workers/instance.container.delete
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')
var sinon = require('sinon')

var Docker = require('models/apis/docker')
var Hosts = require('models/redis/hosts')
var Worker = require('workers/instance.container.delete')
var Instance = require('models/mongo/instance')

var TaskFatalError = require('ponos').TaskFatalError
var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('InstanceContainerDelete: ' + moduleName, function () {
  describe('worker', function () {
    var testInstanceId = '5633e9273e2b5b0c0077fd41'
    var testConatinerId = '46080d6253c8db55b8bbb9408654896964b86c63e863f1b3b0301057d1ad92ba'
    var testPorts = {
      '3000/tcp': [ { HostIp: '0.0.0.0', HostPort: '32987' } ],
      '80/tcp': [ { HostIp: '0.0.0.0', HostPort: '32988' } ]
    }
    var mockInstance = new Instance({
      _id: testInstanceId,
      name: 'name1',
      shortHash: 'asd51a1',
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
        dockerContainer: testConatinerId,
        ports: testPorts
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
    var testData = {
      instanceId: testInstanceId,
      containerId: testConatinerId,
      containerPorts: testPorts
    }
    beforeEach(function (done) {
      sinon.stub(Instance, 'findById').yieldsAsync(null, mockInstance)
      sinon.stub(Hosts.prototype, 'removeHostsForInstance').yieldsAsync(null)
      sinon.stub(Docker.prototype, 'stopContainerWithRetry').yieldsAsync(null)
      sinon.stub(Docker.prototype, 'removeContainerWithRetry').yieldsAsync(null)
      done()
    })

    afterEach(function (done) {
      Instance.findById.restore()
      Hosts.prototype.removeHostsForInstance.restore()
      Docker.prototype.stopContainerWithRetry.restore()
      Docker.prototype.removeContainerWithRetry.restore()
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
      it('should throw a task fatal error if the job is not an object', function (done) {
        Worker(true).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('must be an object')
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
      it('should throw a task fatal error if the instanceId is not a string', function (done) {
        Worker({instanceId: {}}).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('instanceId')
          expect(err.message).to.contain('a string')
          done()
        })
      })
      it('should throw a task fatal error if the job is missing a containerId', function (done) {
        Worker({instanceId: '1'}).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('containerId')
          expect(err.message).to.contain('required')
          done()
        })
      })
      it('should throw a task fatal error if the containerId is not a string', function (done) {
        Worker({instanceId: '1', containerId: {}, containerPorts: {}}).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('containerId')
          expect(err.message).to.contain('a string')
          done()
        })
      })
      it('should throw a task fatal error if the job is missing a containerPorts', function (done) {
        Worker({instanceId: '1', containerId: '1'}).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('containerPorts')
          expect(err.message).to.contain('required')
          done()
        })
      })
      it('should throw a task fatal error if the containerPorts is not a object', function (done) {
        Worker({instanceId: '1', containerId: '1', containerPorts: '1'}).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('containerPorts')
          expect(err.message).to.contain('an object')
          done()
        })
      })
    })

    describe('instance lookup fails', function () {
      var mongoError = new Error('Mongo failed')
      beforeEach(function (done) {
        Instance.findById.yields(mongoError)
        done()
      })

      it('should callback with error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.equal(mongoError.message)
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledWith(Instance.findById, testInstanceId)
            sinon.assert.notCalled(Hosts.prototype.removeHostsForInstance)
            sinon.assert.notCalled(Docker.prototype.stopContainerWithRetry)
            sinon.assert.notCalled(Docker.prototype.removeContainerWithRetry)
            done()
          })
      })
    })

    describe('instance was not found', function () {
      beforeEach(function (done) {
        Instance.findById.yields(null, null)
        done()
      })

      it('should callback with fatal error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err).to.be.instanceOf(TaskFatalError)
            expect(err.message).to.contain('Instance not found')
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledWith(Instance.findById, testInstanceId)
            sinon.assert.notCalled(Hosts.prototype.removeHostsForInstance)
            sinon.assert.notCalled(Docker.prototype.stopContainerWithRetry)
            sinon.assert.notCalled(Docker.prototype.removeContainerWithRetry)
            done()
          })
      })
    })

    describe('removing hosts failed', function () {
      var hostsError = new Error('Hosts failed')
      beforeEach(function (done) {
        Hosts.prototype.removeHostsForInstance.yields(hostsError)
        done()
      })

      it('should callback with fatal error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.contain(hostsError.message)
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledWith(Instance.findById, testInstanceId)
            sinon.assert.calledOnce(Hosts.prototype.removeHostsForInstance)
            sinon.assert.calledWith(Hosts.prototype.removeHostsForInstance, {
              ownerUsername: mockInstance.owner.username,
              ownerGithub: mockInstance.owner.github,
              masterPod: mockInstance.masterPod,
              shortHash: mockInstance.shortHash,
              instanceName: mockInstance.name,
              branch: mockInstance.contextVersion.appCodeVersions[0].lowerBranch
            }, mockInstance.container.ports)
            sinon.assert.notCalled(Docker.prototype.stopContainerWithRetry)
            sinon.assert.notCalled(Docker.prototype.removeContainerWithRetry)
            done()
          })
      })
    })

    describe('stopping container', function () {
      var dockerError = new Error('Docker stop failed')
      beforeEach(function (done) {
        Docker.prototype.stopContainerWithRetry.yields(dockerError)
        done()
      })

      it('should callback with fatal error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.contain(dockerError.message)
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledWith(Instance.findById, testInstanceId)
            sinon.assert.calledOnce(Hosts.prototype.removeHostsForInstance)
            sinon.assert.calledWith(Hosts.prototype.removeHostsForInstance, {
              ownerUsername: mockInstance.owner.username,
              ownerGithub: mockInstance.owner.github,
              masterPod: mockInstance.masterPod,
              shortHash: mockInstance.shortHash,
              instanceName: mockInstance.name,
              branch: mockInstance.contextVersion.appCodeVersions[0].lowerBranch
            }, mockInstance.container.ports)
            sinon.assert.calledOnce(Docker.prototype.stopContainerWithRetry)
            sinon.assert.calledWith(Docker.prototype.stopContainerWithRetry, {
              times: process.env.WORKER_STOP_CONTAINER_NUMBER_RETRY_ATTEMPTS,
              ignoreStatusCode: 404
            }, testConatinerId, true)
            sinon.assert.notCalled(Docker.prototype.removeContainerWithRetry)
            done()
          })
      })
    })

    describe('removing container', function () {
      var dockerError = new Error('Docker stop failed')
      beforeEach(function (done) {
        Docker.prototype.removeContainerWithRetry.yields(dockerError)
        done()
      })

      it('should callback with fatal error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.contain(dockerError.message)
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledWith(Instance.findById, testInstanceId)
            sinon.assert.calledOnce(Hosts.prototype.removeHostsForInstance)
            sinon.assert.calledWith(Hosts.prototype.removeHostsForInstance, {
              ownerUsername: mockInstance.owner.username,
              ownerGithub: mockInstance.owner.github,
              masterPod: mockInstance.masterPod,
              shortHash: mockInstance.shortHash,
              instanceName: mockInstance.name,
              branch: mockInstance.contextVersion.appCodeVersions[0].lowerBranch
            }, mockInstance.container.ports)
            sinon.assert.calledOnce(Docker.prototype.stopContainerWithRetry)
            sinon.assert.calledWith(Docker.prototype.stopContainerWithRetry, {
              times: process.env.WORKER_STOP_CONTAINER_NUMBER_RETRY_ATTEMPTS,
              ignoreStatusCode: 404
            }, testConatinerId, true)
            sinon.assert.calledOnce(Docker.prototype.removeContainerWithRetry)
            sinon.assert.calledWith(Docker.prototype.removeContainerWithRetry, {
              times: process.env.WORKER_REMOVE_CONTAINER_NUMBER_RETRY_ATTEMPTS,
              ignoreStatusCode: 404
            }, testConatinerId)
            done()
          })
      })
    })

    describe('pass', function () {
      it('should return no error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err).to.not.exist()
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledWith(Instance.findById, testInstanceId)
            sinon.assert.calledOnce(Hosts.prototype.removeHostsForInstance)
            sinon.assert.calledWith(Hosts.prototype.removeHostsForInstance, {
              ownerUsername: mockInstance.owner.username,
              ownerGithub: mockInstance.owner.github,
              masterPod: mockInstance.masterPod,
              shortHash: mockInstance.shortHash,
              instanceName: mockInstance.name,
              branch: mockInstance.contextVersion.appCodeVersions[0].lowerBranch
            }, mockInstance.container.ports)
            sinon.assert.calledOnce(Docker.prototype.stopContainerWithRetry)
            sinon.assert.calledWith(Docker.prototype.stopContainerWithRetry, {
              times: process.env.WORKER_STOP_CONTAINER_NUMBER_RETRY_ATTEMPTS,
              ignoreStatusCode: 404
            }, testConatinerId, true)
            sinon.assert.calledOnce(Docker.prototype.removeContainerWithRetry)
            sinon.assert.calledWith(Docker.prototype.removeContainerWithRetry, {
              times: process.env.WORKER_REMOVE_CONTAINER_NUMBER_RETRY_ATTEMPTS,
              ignoreStatusCode: 404
            }, testConatinerId)
            done()
          })
      })
    })
  })
})
