/**
 * @module unit/workers/isolation.match-commit-with-master
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var clone = require('101/clone')
var Code = require('code')
var sinon = require('sinon')
require('sinon-as-promised')(Promise)
var TaskFatalError = require('ponos').TaskFatalError
var objectId = require('objectid')

var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var User = require('models/mongo/user')

var matchCommitWithIsolationGroupMaster = require('workers/isolation.match-commit-with-master')

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('isolation.match-commit-with-master', function () {
  var testJob
  var testJobData = {
    sessionUserGithubId: 12345,
    isolationId: '1234'
  }
  var repoName = 'superRepoName'
  var branchName = 'superBranchName'
  var commitHash = '46409ea4999d1472844e36640375962a0fa1f3b1'
  var masterInstance
  var childInstance
  var childInstance2
  var user

  beforeEach(function (done) {
    masterInstance = {
      _id: objectId('5743c95f450e812600d066c6'),
      contextVersion: {
        appCodeVersions: [{
          repo: repoName,
          branch: branchName,
          commit: commitHash
        }]
      }
    }
    childInstance = {
      _id: objectId('571b39b9d35173300021667d'),
      contextVersion: {
        appCodeVersions: [{
          repo: repoName,
          branch: branchName,
          commit: 'b11410762bf274002fc7f147475525f20ccda91e'
        }]
      }
    }
    childInstance2 = {
      _id: objectId('571b39b9d35173300021667d'),
      contextVersion: {
        appCodeVersions: [{
          repo: 'anotherRepo',
          branch: branchName,
          commit: commitHash // Will be filtered out
        }]
      }
    }
    user = {}
    testJob = clone(testJobData)
    sinon.stub(Instance, 'findIsolationMaster').yieldsAsync(null, masterInstance)
    sinon.stub(Instance, 'findIsolationChildrenWithRepo').yieldsAsync(null, [childInstance, childInstance2])
    sinon.stub(User, 'findByGithubId').yieldsAsync(null, user)
    sinon.stub(InstanceService, 'updateInstanceCommitToNewCommit').resolves(true)
    done()
  })

  afterEach(function (done) {
    Instance.findIsolationMaster.restore()
    Instance.findIsolationChildrenWithRepo.restore()
    User.findByGithubId.restore()
    InstanceService.updateInstanceCommitToNewCommit.restore()
    done()
  })

  describe('errors', function () {
    describe('job validation', function () {
      it('should throw if missing isolationId', function (done) {
        delete testJob.isolationId

        matchCommitWithIsolationGroupMaster(testJob).asCallback(function (err) {
          expect(err).to.be.an.instanceof(TaskFatalError)
          expect(err.message).to.match(/Invalid Job Data/)
          done()
        })
      })

      it('should throw if missing sessionUserGithubId', function (done) {
        delete testJob.sessionUserGithubId

        matchCommitWithIsolationGroupMaster(testJob).asCallback(function (err) {
          expect(err).to.be.an.instanceof(TaskFatalError)
          expect(err.message).to.match(/Invalid Job Data/)
          done()
        })
      })
    })

    describe('behavior errors', function () {
      var testErr

      beforeEach(function (done) {
        testErr = new Error('zed')
        done()
      })

      it('should throw error if findIsolationMaster failed', function (done) {
        Instance.findIsolationMaster.yieldsAsync(testErr)
        matchCommitWithIsolationGroupMaster(testJob).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.cause).to.deep.equal(testErr)
          done()
        })
      })

      it('should throw error if findIsolationChildrenWithRepo failed', function (done) {
        Instance.findIsolationChildrenWithRepo.yieldsAsync(testErr)
        matchCommitWithIsolationGroupMaster(testJob).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.cause).to.deep.equal(testErr)
          done()
        })
      })

      it('should throw a TaskFatalError if the master instances has no repo or commit', function (done) {
        masterInstance.contextVersion.appCodeVersions[0].commit = undefined
        Instance.findIsolationMaster.yieldsAsync(null, masterInstance)
        matchCommitWithIsolationGroupMaster(testJob).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/instance does not have repo.*commit/i)
          done()
        })
      })

      it('should throw a TaskFatalError if there are no child instances', function (done) {
        Instance.findIsolationChildrenWithRepo.yieldsAsync(null, [])
        matchCommitWithIsolationGroupMaster(testJob).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/no.*children.*found/i)
          done()
        })
      })

      it('should throw error if updateInstanceCommitToNewCommit failed', function (done) {
        InstanceService.updateInstanceCommitToNewCommit.rejects(testErr)
        matchCommitWithIsolationGroupMaster(testJob).asCallback(function (err, res) {
          expect(err).to.exist()
          expect(err).to.deep.equal(testErr)
          done()
        })
      })
    })
  })

  describe('valid job', function () {
    it('should call findIsolationChildrenWithRepoAsync', function (done) {
      matchCommitWithIsolationGroupMaster(testJob).asCallback(function (err) {
        expect(err).to.not.exist()

        sinon.assert.calledOnce(Instance.findIsolationChildrenWithRepo)
        sinon.assert.calledWithExactly(
          Instance.findIsolationChildrenWithRepo,
          testJob.isolationId,
          repoName,
          sinon.match.func
        )
        done()
      })
    })

    it('should call findByGithubIdAsync', function (done) {
      matchCommitWithIsolationGroupMaster(testJob).asCallback(function (err) {
        expect(err).to.not.exist()

        sinon.assert.calledOnce(User.findByGithubId)
        sinon.assert.calledWithExactly(
          User.findByGithubId,
          testJob.sessionUserGithubId,
          sinon.match.func
        )
        done()
      })
    })

    describe('updateInstanceCommitToNewCommit', function () {
      it('should call updateInstanceCommitToNewCommit', function (done) {
        matchCommitWithIsolationGroupMaster(testJob).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.called(InstanceService.updateInstanceCommitToNewCommit)
          done()
        })
      })

      it('should filter out instances with the same commit as the enqueue commit', function (done) {
        matchCommitWithIsolationGroupMaster(testJob).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(InstanceService.updateInstanceCommitToNewCommit)
          sinon.assert.calledWithExactly(
            InstanceService.updateInstanceCommitToNewCommit,
            childInstance, // Commit doesn't match commitHash
            commitHash,
            user
          )
          done()
        })
      })
    })
  })
})
