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
  var repoName = 'superRepoName'
  var branchName = 'superBranchName'
  var commitHash = '46409ea4999d1472844e36640375962a0fa1f3b1'
  var masterInstance
  var childInstance
  var childInstance2
  var childInstance3
  var user

  var testJob
  var testJobData = {
    repo: repoName,
    branch: branchName,
    commit: commitHash,
    sessionUserGithubId: 12345,
    isolationId: '1234'
  }

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
    childInstance3 = {
      _id: objectId('571b39b9d35173300021667d'),
      contextVersion: {
        appCodeVersions: [{
          repo: repoName,
          branch: 'somethingDifferent', // Will be filtered out
          commit: 'b11410762bf274002fc7f147475525f20ccda91e'
        }]
      }
    }
    user = {}
    testJob = clone(testJobData)
    sinon.stub(Instance, 'findInstancesInIsolationWithSameRepoAndBranch').yieldsAsync(null, [childInstance, childInstance2])
    sinon.stub(User, 'findByGithubId').yieldsAsync(null, user)
    sinon.stub(InstanceService, 'updateInstanceCommitToNewCommit').resolves(true)
    done()
  })

  afterEach(function (done) {
    Instance.findInstancesInIsolationWithSameRepoAndBranch.restore()
    User.findByGithubId.restore()
    InstanceService.updateInstanceCommitToNewCommit.restore()
    done()
  })

  describe('Errors', function () {
    describe('Job validation', function () {
      ['isolationId', 'repo', 'branch', 'commit', 'sessionUserGithubId'].forEach(function (property) {
        it('should throw if missing `' + property + '`', function (done) {
          delete testJob[property]

          matchCommitWithIsolationGroupMaster(testJob).asCallback(function (err) {
            expect(err).to.be.an.instanceof(TaskFatalError)
            expect(err.message).to.match(/Invalid Job Data/)
            done()
          })
        })
      })
    })

    describe('Behavior Errors', function () {
      var testErr

      beforeEach(function (done) {
        testErr = new Error('zed')
        done()
      })

      it('should throw error if findInstancesInIsolationWithSameRepoAndBranch failed', function (done) {
        Instance.findInstancesInIsolationWithSameRepoAndBranch.yieldsAsync(testErr)
        matchCommitWithIsolationGroupMaster(testJob).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.cause).to.deep.equal(testErr)
          done()
        })
      })

      it('should throw a TaskFatalError if there are no child instances', function (done) {
        Instance.findInstancesInIsolationWithSameRepoAndBranch.yieldsAsync(null, [])
        matchCommitWithIsolationGroupMaster(testJob).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/no.*instances.*found/i)
          done()
        })
      })

      it('should throw error if `updateInstanceCommitToNewCommit` failed', function (done) {
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
    it('should call findInstancesInIsolationWithSameRepoAndBranch', function (done) {
      matchCommitWithIsolationGroupMaster(testJob).asCallback(function (err) {
        expect(err).to.not.exist()

        sinon.assert.calledOnce(Instance.findInstancesInIsolationWithSameRepoAndBranch)
        sinon.assert.calledWithExactly(
          Instance.findInstancesInIsolationWithSameRepoAndBranch,
          testJob.isolationId,
          repoName,
          branchName,
          sinon.match.func
        )
        done()
      })
    })

    it('should call `findByGithubIdAsync`', function (done) {
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

      it('should filter out instances with the same commit as the enqueue commit, a differnt branch or a different repo', function (done) {
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
