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
  var testJob
  var testJobData = {
    container: {
      dockerContainer: 'dockerContainerTest'
    },
    instanceMasterBranch: 'instanceMasterBranchTest',
    instanceMasterPod: true,
    instanceName: 'instanceNameTest',
    instanceShortHash: 'instanceShortHashTest',
    ownerGithubId: 12345,
    ownerGithubUsername: 'ownerGithubUsernameTest',
    isolation: 1234,
    isIsolationGroupMaster: false
  }

  beforeEach(function (done) {
    testJob = clone(testJobData)
    sinon.stub(Docker.prototype, 'stopContainer').yieldsAsync()
    sinon.stub(Docker.prototype, 'removeContainer').yieldsAsync()
    sinon.stub(Hosts.prototype, 'removeHostsForInstance').yieldsAsync()
    done()
  })

  afterEach(function (done) {
    Docker.prototype.stopContainer.restore()
    Docker.prototype.removeContainer.restore()
    Hosts.prototype.removeHostsForInstance.restore()
    done()
  })

  describe('errors', function () {
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

    describe('behavior errors', function () {
      var testErr

      beforeEach(function (done) {
        testErr = new Error('zed')
        done()
      })

      it('should throw error if removeHostsForInstance failed', function (done) {
        Hosts.prototype.removeHostsForInstance.yieldsAsync(testErr)
        InstanceContainerDelete(testJob).asCallback(function (err) {
          expect(err.cause).to.deep.equal(testErr)
          done()
        })
      })

      it('should throw error if stopContainer failed', function (done) {
        Docker.prototype.stopContainer.yieldsAsync(testErr)
        InstanceContainerDelete(testJob).asCallback(function (err) {
          expect(err.cause).to.deep.equal(testErr)
          done()
        })
      })

      it('should throw error if stopContainer failed', function (done) {
        Docker.prototype.removeContainer.yieldsAsync(testErr)
        InstanceContainerDelete(testJob).asCallback(function (err) {
          expect(err.cause).to.deep.equal(testErr)
          done()
        })
      })

      it('should throw task fatal if 404', function (done) {
        testErr.output = { statusCode: 404 }
        Docker.prototype.removeContainer.yieldsAsync(testErr)
        InstanceContainerDelete(testJob).asCallback(function (err) {
          expect(err).to.be.an.instanceof(TaskFatalError)
          expect(err.message).to.match(/container not found/)
          done()
        })
      })
    })
  })

  describe('valid job', function () {
    it('should call removeHostsForInstance', function (done) {
      InstanceContainerDelete(testJob).asCallback(function (err) {
        expect(err).to.not.exist()

        sinon.assert.calledOnce(Hosts.prototype.removeHostsForInstance)
        sinon.assert.calledWithExactly(
          Hosts.prototype.removeHostsForInstance,
          {
            ownerUsername: testJobData.ownerGithubUsername,
            ownerGithub: testJobData.ownerGithubId,
            branch: testJobData.instanceMasterBranch,
            masterPod: testJobData.instanceMasterPod,
            instanceName: testJobData.instanceName,
            shortHash: testJobData.instanceShortHash,
            isolated: testJobData.isolated,
            isIsolationGroupMaster: testJobData.isIsolationGroupMaster
          },
          testJob.container,
          sinon.match.func
        )
        done()
      })
    })

    it('should call stopContainer', function (done) {
      InstanceContainerDelete(testJob).asCallback(function (err) {
        expect(err).to.not.exist()

        sinon.assert.calledOnce(Docker.prototype.stopContainer)
        sinon.assert.calledWithExactly(
          Docker.prototype.stopContainer,
          testJobData.container.dockerContainer,
          true,
          sinon.match.func
        )
        done()
      })
    })

    it('should call removeContainer', function (done) {
      InstanceContainerDelete(testJob).asCallback(function (err) {
        expect(err).to.not.exist()

        sinon.assert.calledOnce(Docker.prototype.removeContainer)
        sinon.assert.calledWithExactly(
          Docker.prototype.removeContainer,
          testJobData.container.dockerContainer,
          sinon.match.func
        )
        done()
      })
    })

    it('should resolve', function (done) {
      Docker.prototype.removeContainer.yieldsAsync(null)
      InstanceContainerDelete(testJob).asCallback(function (err) {
        expect(err).to.not.exist()
        done()
      })
    })

    it('should call all these things in order', function (done) {
      InstanceContainerDelete(testJob).asCallback(function (err) {
        expect(err).to.not.exist()

        sinon.assert.callOrder(
          Docker.prototype.stopContainer,
          Docker.prototype.removeContainer
        )
        done()
      })
    })

    it('should resolve if instanceMasterBranch is null', function (done) {
      testJob.instanceMasterBranch = null
      InstanceContainerDelete(testJob).asCallback(function (err) {
        expect(err).to.not.exist()
        done()
      })
    })

    it('should resolve if missing instanceMasterBranch', function (done) {
      delete testJob.instanceMasterBranch
      InstanceContainerDelete(testJob).asCallback(function (err) {
        expect(err).to.not.exist()

        sinon.assert.callOrder(
          Docker.prototype.stopContainer,
          Docker.prototype.removeContainer
        )
        done()
      })
    })
  }) // end valid job
}) // end instance.container.delete unit test
