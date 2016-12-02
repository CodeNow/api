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
const BuildService = require('models/services/build-service')
const ContextService = require('models/services/context-service')
const ContextVersion = require('models/mongo/context-version')
const InstanceService = require('models/services/instance-service')

require('sinon-as-promised')(Promise)

describe('Docker Compose Cluster Service Unit Tests', function () {
  let testSessionUser
  const testOrgGithubId = 123

  beforeEach((done) => {
    testSessionUser = {
      _id: 'id',
      accounts: {
        github: {
          id: testOrgGithubId
        },
        login: 'login',
        username: 'best'
      }
    }
    done()
  })
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
      const testParentComposeData = { data: 'base' }
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

  describe('_createParentContext', () => {
    beforeEach((done) => {
      sinon.stub(ContextService, 'createNew')
      done()
    })

    afterEach((done) => {
      ContextService.createNew.restore()
      done()
    })

    it('should create context', (done) => {
      const testContext = 'context'
      ContextService.createNew.resolves(testContext)

      DockerComposeClusterService._createParentContext(testSessionUser, testOrgGithubId).asCallback((err, context) => {
        if (err) { return done(err) }
        sinon.assert.calledOnce(ContextService.createNew)
        sinon.assert.calledWith(ContextService.createNew, testSessionUser, sinon.match({
          name: sinon.match.string,
          owner: testOrgGithubId
        }))

        expect(context).to.equal(testContext)
        done()
      })
    })
  }) // end _createParentContext

  describe('_createParentContextVersion', () => {
    beforeEach((done) => {
      sinon.stub(ContextVersion, 'createAppcodeVersion')
      sinon.stub(ContextVersion, 'createWithNewInfraCode')
      done()
    })

    afterEach((done) => {
      ContextVersion.createAppcodeVersion.restore()
      ContextVersion.createWithNewInfraCode.restore()
      done()
    })

    it('should create contextVersion', (done) => {
      const testRepoName = 'runnable/boo'
      const testContextId = objectId('407f191e810c19729de860ef')
      const testContextVersion = { _id: 'contextVersion' }
      const testAppCodeVersion = { _id: 'testAppCodeVersion' }

      ContextVersion.createAppcodeVersion.resolves(testAppCodeVersion)
      ContextVersion.createWithNewInfraCode.resolves(testContextVersion)

      DockerComposeClusterService._createParentContextVersion(testSessionUser, testContextId, testOrgGithubId, testRepoName).asCallback((err, contextVersion) => {
        if (err) { return done(err) }
        expect(contextVersion).to.equal(testContextVersion)
        sinon.assert.calledOnce(ContextVersion.createAppcodeVersion)
        sinon.assert.calledWith(ContextVersion.createAppcodeVersion, testSessionUser, testRepoName)
        sinon.assert.calledOnce(ContextVersion.createWithNewInfraCode)
        sinon.assert.calledWith(ContextVersion.createWithNewInfraCode, {
          context: testContextId,
          createdBy: {
            github: testOrgGithubId
          },
          owner: {
            github: testOrgGithubId
          },
          appCodeVersions: [testAppCodeVersion]
        })
        done()
      })
    })
  }) // end _createParentContextVersion

  describe('_createParentBuild', () => {
    beforeEach((done) => {
      sinon.stub(BuildService, 'createBuild')
      done()
    })

    afterEach((done) => {
      BuildService.createBuild.restore()
      done()
    })

    it('should create build', (done) => {
      const testContextVersionId = objectId('407f191e810c19729de860ef')
      const testBuild = 'build'
      BuildService.createBuild.resolves(testBuild)

      DockerComposeClusterService._createParentBuild(testSessionUser, testContextVersionId).asCallback((err, build) => {
        if (err) { return done(err) }
        sinon.assert.calledOnce(BuildService.createBuild)
        sinon.assert.calledWith(BuildService.createBuild, {
          contextVersion: testContextVersionId
        }, testSessionUser)

        expect(build).to.equal(testBuild)
        done()
      })
    })
  }) // end _createParentBuild

  describe('_createParentInstance', () => {
    beforeEach((done) => {
      sinon.stub(InstanceService, 'createInstance')
      done()
    })

    afterEach((done) => {
      InstanceService.createInstance.restore()
      done()
    })

    it('should create context', (done) => {
      const testParentBuildId = objectId('407f191e810c19729de860ef')
      const testParentComposeData = {
        env: 'env',
        containerStartCommand: 'containerStartCommand',
        name: 'name'
      }
      const testInstance = 'build'
      InstanceService.createInstance.resolves(testInstance)

      DockerComposeClusterService._createParentInstance(testSessionUser, testParentComposeData, testParentBuildId).asCallback((err, instance) => {
        if (err) { return done(err) }
        sinon.assert.calledOnce(InstanceService.createInstance)
        sinon.assert.calledWith(InstanceService.createInstance, {
          build: testParentBuildId,
          env: testParentComposeData.env,
          containerStartCommand: testParentComposeData.containerStartCommand,
          name: testParentComposeData.name,
          isTesting: false,
          masterPod: true,
          ipWhitelist: {
            enabled: false
          }
        })

        expect(instance).to.equal(testInstance)
        done()
      })
    })
  }) // end _createParentInstance

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
