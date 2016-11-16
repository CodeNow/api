/**
 * @module unit/workers/application.container.delete
 */
'use strict'

const Lab = require('lab')
const lab = exports.lab = Lab.script()

const clone = require('101/clone')
const Code = require('code')
const sinon = require('sinon')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

const InstanceContainerDelete = require('workers/application.container.delete')
const Docker = require('models/apis/docker')

const afterEach = lab.afterEach
const beforeEach = lab.beforeEach
const describe = lab.describe
const expect = Code.expect
const it = lab.it

describe('application.container.delete unit test', function () {
  let testJob
  const testJobData = {
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
    done()
  })

  afterEach(function (done) {
    Docker.prototype.stopContainer.restore()
    Docker.prototype.removeContainer.restore()
    done()
  })

  describe('errors', function () {
    describe('behavior errors', function () {
      let testErr

      beforeEach(function (done) {
        testErr = new Error('zed')
        done()
      })

      it('should throw error if stopContainer failed', function (done) {
        Docker.prototype.stopContainer.yieldsAsync(testErr)
        InstanceContainerDelete.task(testJob).asCallback(function (err) {
          expect(err.cause).to.equal(testErr)
          done()
        })
      })

      it('should throw error if stopContainer failed', function (done) {
        Docker.prototype.removeContainer.yieldsAsync(testErr)
        InstanceContainerDelete.task(testJob).asCallback(function (err) {
          expect(err.cause).to.equal(testErr)
          done()
        })
      })

      it('should throw task fatal if 404', function (done) {
        testErr.output = { statusCode: 404 }
        Docker.prototype.removeContainer.yieldsAsync(testErr)
        InstanceContainerDelete.task(testJob).asCallback(function (err) {
          expect(err).to.be.an.instanceof(WorkerStopError)
          expect(err.message).to.match(/container not found/)
          done()
        })
      })
    })
  })

  describe('valid job', function () {
    it('should call stopContainer', function (done) {
      InstanceContainerDelete.task(testJob).asCallback(function (err) {
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
      InstanceContainerDelete.task(testJob).asCallback(function (err) {
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
      InstanceContainerDelete.task(testJob).asCallback(function (err) {
        expect(err).to.not.exist()
        done()
      })
    })

    it('should call all these things in order', function (done) {
      InstanceContainerDelete.task(testJob).asCallback(function (err) {
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
      InstanceContainerDelete.task(testJob).asCallback(function (err) {
        expect(err).to.not.exist()
        done()
      })
    })

    it('should resolve if missing instanceMasterBranch', function (done) {
      delete testJob.instanceMasterBranch
      InstanceContainerDelete.task(testJob).asCallback(function (err) {
        expect(err).to.not.exist()

        sinon.assert.callOrder(
          Docker.prototype.stopContainer,
          Docker.prototype.removeContainer
        )
        done()
      })
    })
  }) // end valid job
}) // end application.container.delete unit test
