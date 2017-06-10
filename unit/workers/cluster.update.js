/**
 * @module unit/workers/cluster.update
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

const BaseSchema = require('models/mongo/schemas/base')
const ClusterConfigService = require('models/services/cluster-config-service')
const Instance = require('models/mongo/instance')
const InstanceService = require('models/services/instance-service')
const UserService = require('models/services/user-service')
const Worker = require('workers/cluster.update')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

describe('Cluster Update Worker', function () {
  describe('worker', function () {
    var testInstanceId = '5633e9273e2b5b0c0077fd41'
    const bigPoppaUser = {}
    const user = {
      id: 123,
      login: 'user',
      bigPoppaUser
    }
    const githubPushInfo = {
      repo: user.login + '/repo',
      branch: 'branch',
      commit: 'asdasdsad',
      user: user
    }
    const config = {
      repo: user.login + '/repo',
      branch: 'branch',
      files: [{
        path: 'github.com',
        sha: 'ab17haa9a'
      }],
      clusterName: 'asdasd'
    }
    const composeData = {
      files: [{
        path: 'github.com',
        sha: 'ab17haa9a'
      }]
    }
    const octobearInfo = {}
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
        container: {},
        network: {
          hostIp: '0.0.0.0'
        },
        build: '507f191e810c19729de860e2'
      })
      done()
    })
    beforeEach(function (done) {
      sinon.stub(UserService, 'getCompleteUserByGithubId').resolves(user)
      sinon.stub(InstanceService, 'findInstanceById').resolves(testInstance)
      sinon.stub(ClusterConfigService, 'fetchConfigByInstanceId').resolves(config)
      sinon.stub(ClusterConfigService, 'parseComposeFileAndPopulateENVs').resolves(octobearInfo)
      sinon.stub(ClusterConfigService, 'updateCluster').resolves()
      done()
    })

    afterEach(function (done) {
      UserService.getCompleteUserByGithubId.restore()
      InstanceService.findInstanceById.restore()
      ClusterConfigService.fetchConfigByInstanceId.restore()
      ClusterConfigService.parseComposeFileAndPopulateENVs.restore()
      ClusterConfigService.updateCluster.restore()
      done()
    })

    describe('errors', function () {
      it('should reject WorkerStopError with any instance.notFound errors', function (done) {
        const error = new Instance.NotFoundError({})
        InstanceService.findInstanceById.rejects(error)
        Worker.task(job)
          .asCallback(function (err) {
            expect(err).to.be.instanceOf(WorkerStopError)
            expect(err.message).to.equal('Instance not found')
            done()
          })
      })
      it('should reject WorkerStopError with any base.notFound errors', function (done) {
        const error = new BaseSchema.NotFoundError('Mongo', {})
        ClusterConfigService.fetchConfigByInstanceId.rejects(error)
        Worker.task(job)
          .asCallback(function (err) {
            expect(err).to.be.instanceOf(WorkerStopError)
            expect(err.message).to.equal('Config not found')
            done()
          })
      })
    })

    describe('success', function () {
      it('should return no error', function (done) {
        Worker.task(job)
          .asCallback(done)
      })

      it('should find an user by github id from the pushInfo', function (done) {
        Worker.task(job)
          .then(() => {
            sinon.assert.calledOnce(UserService.getCompleteUserByGithubId)
            sinon.assert.calledWithExactly(UserService.getCompleteUserByGithubId, job.pushInfo.user.id)
          })
          .asCallback(done)
      })

      it('should fetch the instance', function (done) {
        Worker.task(job)
          .then(() => {
            sinon.assert.calledOnce(InstanceService.findInstanceById)
            sinon.assert.calledWithExactly(InstanceService.findInstanceById, job.instanceId)
          })
          .asCallback(done)
      })

      it('should fetch the config by instance id', function (done) {
        Worker.task(job)
          .then(() => {
            sinon.assert.calledOnce(ClusterConfigService.fetchConfigByInstanceId)
            sinon.assert.calledWithExactly(ClusterConfigService.fetchConfigByInstanceId, job.instanceId)
          })
          .asCallback(done)
      })

      it('should parse the compose files', function (done) {
        Worker.task(job)
          .then(() => {
            sinon.assert.calledOnce(ClusterConfigService.parseComposeFileAndPopulateENVs)
            sinon.assert.calledWithExactly(
              ClusterConfigService.parseComposeFileAndPopulateENVs,
              job.pushInfo.repo,
              config.clusterName,
              bigPoppaUser,
              config.files[0].path,
              githubPushInfo.commit
            )
          })
          .asCallback(done)
      })

      it('should call functions in order', function (done) {
        Worker.task(job)
          .then(() => {
            sinon.assert.callOrder(
              UserService.getCompleteUserByGithubId,
              InstanceService.findInstanceById,
              ClusterConfigService.fetchConfigByInstanceId,
              ClusterConfigService.parseComposeFileAndPopulateENVs,
              ClusterConfigService.updateCluster
            )
          })
          .asCallback(done)
      })
    })
  })
})
