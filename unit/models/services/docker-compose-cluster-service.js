'use strict'

const Lab = require('lab')
const lab = exports.lab = Lab.script()
const describe = lab.describe
const it = lab.it
const beforeEach = lab.beforeEach
const afterEach = lab.afterEach

const Code = require('code')
const expect = Code.expect
const objectId = require('objectid')
const Promise = require('bluebird')
const sinon = require('sinon')

const DockerComposeCluster = require('models/mongo/docker-compose-cluster')
const DockerComposeClusterService = require('models/services/docker-compose-cluster-service')
const rabbitMQ = require('models/rabbitmq')

require('sinon-as-promised')(Promise)

describe('Docker Compose Cluster Service Unit Tests', function () {
  describe('createClusterParent', () => {
    beforeEach((done) => {
      sinon.stub(DockerComposeClusterService, '_createParentContext')
      sinon.stub(DockerComposeClusterService, '_createParentContextVersion')
      sinon.stub(DockerComposeClusterService, '_createParentBuild')
      sinon.stub(DockerComposeClusterService, '_createParentInstance')
      done()
    })

    afterEach((done) => {
      DockerComposeClusterService._createParentInstance.restore()
      DockerComposeClusterService._createParentBuild.restore()
      DockerComposeClusterService._createParentContextVersion.restore()
      DockerComposeClusterService._createParentContext.restore()
      done()
    })

    it('should create cluster parent', (done) => {
      const testSessionUser = '1321'
      const testParentComposeData = { data: 'base' }
      const testOrgGithubId = '123'
      const testRepoName = 'runnable/boo'
      const testInstance = { _id: 'instance' }
      const testBuild = { _id: 'build' }
      const testContext = { _id: 'context' }
      const testContextVersion = { _id: 'contextVersion' }

      DockerComposeClusterService._createParentInstance.resolves(testInstance)
      DockerComposeClusterService._createParentBuild.resolves(testBuild)
      DockerComposeClusterService._createParentContextVersion.resolves(testContextVersion)
      DockerComposeClusterService._createParentContext.resolves(testContext)

      DockerComposeClusterService.createClusterParent(testSessionUser, testParentComposeData, testOrgGithubId, testRepoName).asCallback((err, instance) => {
        if (err) { return done(err) }
        expect(instance).to.equal(testInstance)
        sinon.assert.calledOnce(DockerComposeClusterService._createParentContext)
        sinon.assert.calledWith(DockerComposeClusterService._createParentContext, testSessionUser, testOrgGithubId)
        sinon.assert.calledOnce(DockerComposeClusterService._createParentContextVersion)
        sinon.assert.calledWith(DockerComposeClusterService._createParentContextVersion, testSessionUser, testContext._id, testOrgGithubId, testRepoName)
        sinon.assert.calledOnce(DockerComposeClusterService._createParentBuild)
        sinon.assert.calledWith(DockerComposeClusterService._createParentBuild, testSessionUser, testContextVersion._id)
        sinon.assert.calledOnce(DockerComposeClusterService._createParentInstance)
        sinon.assert.calledWith(DockerComposeClusterService._createParentInstance, testSessionUser, testParentComposeData, testBuild._id)
        done()
      })
    })
  }) // end createClusterParent

  describe('delete', function () {
    const clusterId = objectId('407f191e810c19729de860ef')
    const parentInstanceId = objectId('507f191e810c19729de860ea')
    const clusterData = {
      _id: clusterId,
      dockerComposeFilePath: '/config/compose.yml',
      parentInstanceId: parentInstanceId,
      siblingsInstanceIds: [
        objectId('607f191e810c19729de860eb'),
        objectId('707f191e810c19729de860ec')
      ]
    }
    beforeEach(function (done) {
      sinon.stub(DockerComposeCluster, 'findByIdAndAssert').resolves(new DockerComposeCluster(clusterData))
      sinon.stub(DockerComposeCluster, 'markAsDeleted').resolves()
      sinon.stub(rabbitMQ, 'deleteInstance').returns()
      sinon.stub(rabbitMQ, 'clusterDeleted').returns()
      done()
    })
    afterEach(function (done) {
      DockerComposeCluster.findByIdAndAssert.restore()
      DockerComposeCluster.markAsDeleted.restore()
      rabbitMQ.deleteInstance.restore()
      rabbitMQ.clusterDeleted.restore()
      done()
    })
    describe('errors', function () {
      it('should return error if findByIdAndAssert failed', function (done) {
        const error = new Error('Some error')
        DockerComposeCluster.findByIdAndAssert.rejects(error)
        DockerComposeClusterService.delete(clusterId.toString())
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })

      it('should return error if deleteInstance failed', function (done) {
        const error = new Error('Some error')
        rabbitMQ.deleteInstance.throws(error)
        DockerComposeClusterService.delete(clusterId.toString())
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })

      it('should return error if findByIdAndAssert failed', function (done) {
        const error = new Error('Some error')
        DockerComposeCluster.markAsDeleted.rejects(error)
        DockerComposeClusterService.delete(clusterId.toString())
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })

      it('should return error if clusterDeleted failed', function (done) {
        const error = new Error('Some error')
        rabbitMQ.clusterDeleted.throws(error)
        DockerComposeClusterService.delete(clusterId.toString())
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })
    })
    describe('success', function () {
      it('should run successfully', function (done) {
        DockerComposeClusterService.delete(clusterId.toString()).asCallback(done)
      })

      it('should call findByIdAndAssert with correct args', function (done) {
        DockerComposeClusterService.delete(clusterId.toString())
        .tap(function () {
          sinon.assert.calledOnce(DockerComposeCluster.findByIdAndAssert)
          sinon.assert.calledWithExactly(DockerComposeCluster.findByIdAndAssert, clusterId.toString())
        })
        .asCallback(done)
      })

      it('should call deleteInstance with correct args', function (done) {
        DockerComposeClusterService.delete(clusterId.toString())
        .tap(function () {
          sinon.assert.calledTwice(rabbitMQ.deleteInstance)
          sinon.assert.calledWithExactly(rabbitMQ.deleteInstance, { instanceId: clusterData.siblingsInstanceIds[0] })
          sinon.assert.calledWithExactly(rabbitMQ.deleteInstance, { instanceId: clusterData.siblingsInstanceIds[1] })
        })
        .asCallback(done)
      })

      it('should call markAsDeleted with correct args', function (done) {
        DockerComposeClusterService.delete(clusterId.toString())
        .tap(function () {
          sinon.assert.calledOnce(DockerComposeCluster.markAsDeleted)
          sinon.assert.calledWithExactly(DockerComposeCluster.markAsDeleted, clusterId)
        })
        .asCallback(done)
      })

      it('should call clusterDeleted with correct args', function (done) {
        DockerComposeClusterService.delete(clusterId.toString())
        .tap(function () {
          sinon.assert.calledOnce(rabbitMQ.clusterDeleted)
          const cluster = { id: clusterId.toString() }
          sinon.assert.calledWithExactly(rabbitMQ.clusterDeleted, { cluster })
        })
        .asCallback(done)
      })

      it('should call all the functions in the order', function (done) {
        DockerComposeClusterService.delete(clusterId.toString())
        .tap(function () {
          sinon.assert.callOrder(
            DockerComposeCluster.findByIdAndAssert,
            rabbitMQ.deleteInstance,
            DockerComposeCluster.markAsDeleted,
            rabbitMQ.clusterDeleted)
        })
        .asCallback(done)
      })
    })
  })
})
