/**
 * @module unit/workers/cluster.create
 */
'use strict'

const Lab = require('lab')
const lab = exports.lab = Lab.script()

const afterEach = lab.afterEach
const beforeEach = lab.beforeEach
const describe = lab.describe
const expect = require('code').expect
const it = lab.it

const Promise = require('bluebird')
const sinon = require('sinon')
require('sinon-as-promised')(Promise)

const ClusterBuildService = require('models/services/cluster-build-service')
const ClusterConfigService = require('models/services/cluster-config-service')
const messenger = require('socket/messenger')
const UserService = require('models/services/user-service')
const Worker = require('workers/cluster.create')
const WorkerStopError = require('error-cat/errors/worker-stop-error')
const rabbitMQ = require('models/rabbitmq')

describe('Cluster Create Worker', function () {
  describe('worker', function () {
    const clusterBuildId = 11111
    const clusterBuild = {
      _id: clusterBuildId,
      createdByUser: 123,
      triggeredInfo: {
        action: 'user',
        repo: 'Runnable/api',
        branch: 'feature-1',
      }
    }
    const testData = {
      clusterBuildId,
      filePath: 'compose.yml',
      parentInputClusterConfigId: 'husker du',
      isTesting: true,
      clusterName: 'api',
      testReporters: []
    }
    const sessionUser = {
      _id: 'some-id'
    }
    beforeEach(function (done) {
      sinon.stub(ClusterBuildService, 'findActiveByIdAndState').resolves(clusterBuild)
      sinon.stub(ClusterConfigService, 'create').resolves({ inputClusterConfig: {_id: '999999' }})
      sinon.stub(ClusterConfigService, 'sendClusterSocketUpdate').resolves()
      sinon.stub(UserService, 'getCompleteUserByBigPoppaId').resolves(sessionUser)
      sinon.stub(rabbitMQ, 'cleanupCluster')
      done()
    })

    afterEach(function (done) {
      ClusterBuildService.findActiveByIdAndState.restore()
      ClusterConfigService.create.restore()
      ClusterConfigService.sendClusterSocketUpdate.restore()
      UserService.getCompleteUserByBigPoppaId.restore()
      rabbitMQ.cleanupCluster.restore()
      done()
    })

    describe('errors', function () {
      it('should reject with any ClusterBuildService.findActiveByIdAndState error', function (done) {
        const mongoError = new Error('Mongo failed')
        ClusterBuildService.findActiveByIdAndState.rejects(mongoError)
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(mongoError)
          done()
        })
      })
      it('should reject with any UserService.getCompleteUserByBigPoppaId error', function (done) {
        const mongoError = new Error('Mongo failed')
        UserService.getCompleteUserByBigPoppaId.rejects(mongoError)
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(mongoError)
          done()
        })
      })
      it('should reject with any ClusterConfigService.create error', function (done) {
        const mongoError = new Error('Mongo failed')
        ClusterConfigService.create.rejects(mongoError)
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.be.an.instanceof(WorkerStopError)
          done()
        })
      })
      it('should enqueue a cluster.cleanup task on failure', function (done) {
        ClusterConfigService.create.rejects(new Error('bad luck'))
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.exist()
          sinon.assert.calledThrice(rabbitMQ.cleanupCluster)
          done()
        })
      })
    })

    describe('success', function () {
      it('should return no error', function (done) {
        Worker.task(testData).asCallback(done)
      })

      it('should find deployment', function (done) {
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(ClusterBuildService.findActiveByIdAndState)
          sinon.assert.calledWithExactly(ClusterBuildService.findActiveByIdAndState, clusterBuildId, 'created')
          done()
        })
      })
      it('should find an user by bigPoppaId', function (done) {
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(UserService.getCompleteUserByBigPoppaId)
          sinon.assert.calledWithExactly(UserService.getCompleteUserByBigPoppaId, clusterBuild.createdByUser)
          done()
        })
      })

      it('should call create cluster', function (done) {
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(ClusterConfigService.create)
          const data = Object.assign({}, testData)
          delete data.clusterBuildId
          data.branchName = clusterBuild.triggeredInfo.branch
          data.repoFullName = clusterBuild.triggeredInfo.repo
          data.triggeredAction = clusterBuild.triggeredInfo.action
          sinon.assert.calledWithExactly(ClusterConfigService.create, sessionUser, data)
          done()
        })
      })

      it('should call functions in order', function (done) {
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.callOrder(
            ClusterBuildService.findActiveByIdAndState,
            UserService.getCompleteUserByBigPoppaId,
            ClusterConfigService.create
          )
          done()
        })
      })
    })
  })
})
