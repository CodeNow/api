/**
 * @module unit/workers/instance.container.delete
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var clone = require('101/clone')
var Code = require('code')
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

var InstanceContainerDelete = require('workers/instance.container.delete')
var Docker = require('models/apis/docker')
var Hosts = require('models/redis/hosts')

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('instance.container.delete unit test', function () {
  var testJobData = {
    container: {
      dockerContainer: 'dockerContainerTest'
    },
    instanceMasterBranch: 'instanceMasterBranchTest',
    instanceMasterPod: 'instanceMasterPodTest',
    instanceName: 'instanceNameTest',
    instanceShortHash: 'instanceShortHashTest',
    ownerGithubId: 'ownerGithubIdTest',
    ownerGithubUsername: 'ownerGithubUsernameTest'
  }

  var testJob
  beforeEach(function (done) {
    testJob = clone(testJobData)
    done()
  })

  describe('job validation', function () {
    it('should throw if missing container', function (done) {
      delete testJob.container

      InstanceContainerDelete(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.message).to.match(/Invalid Job Data/)
        done()
      })
    })

    it('should throw if missing dockerContainer', function (done) {
      delete testJob.container.dockerContainer

      InstanceContainerDelete(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.message).to.match(/Invalid Job Data/)
        done()
      })
    })

    it('should throw if instanceMasterBranch not a string', function (done) {
      testJob.instanceMasterBranch = 1234

      InstanceContainerDelete(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.message).to.match(/Invalid Job Data/)
        done()
      })
    })

    it('should throw if missing instanceMasterPod', function (done) {
      delete testJob.instanceMasterPod

      InstanceContainerDelete(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.message).to.match(/Invalid Job Data/)
        done()
      })
    })

    it('should throw if missing instanceName', function (done) {
      delete testJob.instanceName

      InstanceContainerDelete(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.message).to.match(/Invalid Job Data/)
        done()
      })
    })

    it('should throw if missing instanceShortHash', function (done) {
      delete testJob.instanceShortHash

      InstanceContainerDelete(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.message).to.match(/Invalid Job Data/)
        done()
      })
    })

    it('should throw if missing ownerGithubId', function (done) {
      delete testJob.ownerGithubId

      InstanceContainerDelete(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.message).to.match(/Invalid Job Data/)
        done()
      })
    })

    it('should throw if missing ownerGithubUsername', function (done) {
      delete testJob.ownerGithubUsername

      InstanceContainerDelete(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.message).to.match(/Invalid Job Data/)
        done()
      })
    })
  }) // end job validation

  describe('valid job', function () {
    beforeEach(function (done) {
      sinon.stub(Docker.prototype, 'stopContainer')
      sinon.stub(Docker.prototype, 'removeContainer')
      sinon.stub(Hosts.prototype, 'removeHostsForInstance')
      done()
    })

    afterEach(function (done) {
      Docker.prototype.stopContainer.restore()
      Docker.prototype.removeContainer.restore()
      Hosts.prototype.removeHostsForInstance.restore()
      done()
    })

    it('should throw error if removeHostsForInstance failed', function (done) {
      var testErr = new Error('zed')
      Hosts.prototype.removeHostsForInstance.yieldsAsync(testErr)

      InstanceContainerDelete(testJob).asCallback(function (err) {
        expect(testErr).to.deep.equal(err.cause)

        sinon.assert.calledOnce(Hosts.prototype.removeHostsForInstance)
        sinon.assert.calledWith(Hosts.prototype.removeHostsForInstance, {
          ownerUsername: testJobData.ownerGithubUsername,
          ownerGithub: testJobData.ownerGithubId,
          branch: testJobData.instanceMasterBranch,
          masterPod: testJobData.instanceMasterPod,
          instanceName: testJobData.instanceName,
          shortHash: testJobData.instanceShortHash
        })

        done()
      })
    })

    it('should throw error if stopContainer failed', function (done) {
      var testErr = new Error('is')
      Hosts.prototype.removeHostsForInstance.yieldsAsync()
      Docker.prototype.stopContainer.yieldsAsync(testErr)

      InstanceContainerDelete(testJob).asCallback(function (err) {
        expect(testErr).to.deep.equal(err.cause)

        sinon.assert.calledOnce(Docker.prototype.stopContainer)
        sinon.assert.calledWith(Docker.prototype.stopContainer, testJobData.container.dockerContainer)

        done()
      })
    })

    it('should throw error if stopContainer failed', function (done) {
      var testErr = new Error('dead')
      Hosts.prototype.removeHostsForInstance.yieldsAsync()
      Docker.prototype.stopContainer.yieldsAsync()
      Docker.prototype.removeContainer.yieldsAsync(testErr)

      InstanceContainerDelete(testJob).asCallback(function (err) {
        expect(testErr).to.deep.equal(err.cause)

        sinon.assert.calledOnce(Docker.prototype.removeContainer)
        sinon.assert.calledWith(Docker.prototype.removeContainer, testJobData.container.dockerContainer)

        done()
      })
    })

    it('should throw task fatal if 404', function (done) {
      var testErr = {
        output: {
          statusCode: 404
        }
      }
      Hosts.prototype.removeHostsForInstance.yieldsAsync()
      Docker.prototype.stopContainer.yieldsAsync()
      Docker.prototype.removeContainer.yieldsAsync(testErr)

      InstanceContainerDelete(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.message).to.match(/container not found/)

        done()
      })
    })

    it('should resolve', function (done) {
      Hosts.prototype.removeHostsForInstance.yieldsAsync()
      Docker.prototype.stopContainer.yieldsAsync()
      Docker.prototype.removeContainer.yieldsAsync()

      InstanceContainerDelete(testJob).asCallback(function (err) {
        if (err) { return done(err) }

        sinon.assert.calledOnce(Docker.prototype.removeContainer)
        sinon.assert.calledWith(Docker.prototype.removeContainer, testJobData.container.dockerContainer)

        sinon.assert.calledOnce(Docker.prototype.stopContainer)
        sinon.assert.calledWith(Docker.prototype.stopContainer, testJobData.container.dockerContainer)

        sinon.assert.calledOnce(Hosts.prototype.removeHostsForInstance)
        sinon.assert.calledWith(Hosts.prototype.removeHostsForInstance, {
          ownerUsername: testJobData.ownerGithubUsername,
          ownerGithub: testJobData.ownerGithubId,
          branch: testJobData.instanceMasterBranch,
          masterPod: testJobData.instanceMasterPod,
          instanceName: testJobData.instanceName,
          shortHash: testJobData.instanceShortHash
        })

        done()
      })
    })

    it('should resolve if missing instanceMasterBranch', function (done) {
      delete testJob.instanceMasterBranch

      Hosts.prototype.removeHostsForInstance.yieldsAsync()
      Docker.prototype.stopContainer.yieldsAsync()
      Docker.prototype.removeContainer.yieldsAsync()

      InstanceContainerDelete(testJob).asCallback(function (err) {
        if (err) { return done(err) }

        sinon.assert.calledOnce(Hosts.prototype.removeHostsForInstance)
        sinon.assert.calledWith(Hosts.prototype.removeHostsForInstance, {
          ownerUsername: testJobData.ownerGithubUsername,
          ownerGithub: testJobData.ownerGithubId,
          branch: undefined,
          masterPod: testJobData.instanceMasterPod,
          instanceName: testJobData.instanceName,
          shortHash: testJobData.instanceShortHash
        })

        done()
      })
    })
  }) // end valid job
}) // end instance.container.delete unit test
