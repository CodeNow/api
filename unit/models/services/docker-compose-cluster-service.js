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
const GitHub = require('models/apis/github')
const octobear = require('@runnable/octobear')
const BuildService = require('models/services/build-service')
const ContextService = require('models/services/context-service')
const ContextVersion = require('models/mongo/context-version')
const InstanceService = require('models/services/instance-service')

require('sinon-as-promised')(Promise)

describe('Docker Compose Cluster Service Unit Tests', function () {
  let testParsedContent
  let testMainParsedContent
  beforeEach((done) => {
    testMainParsedContent = {
      metadata: {
        name: 'api',
        isMain: true
      },
      contextVersion: {
        advanced: true,
        buildDockerfilePath: '.'
      },
      files: { // Optional
        '/Dockerfile': {
          body: 'FROM node'
        }
      },
      instance: {
        name: 'api',
        containerStartCommand: 'npm start',
        ports: [80],
        env: ['HELLO=WORLD']
      }
    }
    testParsedContent = {
      results: [testMainParsedContent]
    }
    done()
  })
  describe('create', function () {
    const clusterId = objectId('407f191e810c19729de860ef')
    const parentInstanceId = objectId('507f191e810c19729de860ea')
    const dockerComposeFilePath = 'config/compose.yml'
    const clusterData = {
      _id: clusterId,
      dockerComposeFilePath: dockerComposeFilePath,
      parentInstanceId: parentInstanceId,
      siblingsInstanceIds: [
        objectId('607f191e810c19729de860eb'),
        objectId('707f191e810c19729de860ec')
      ]
    }

    const sessionUser = {
      _id: objectId('107f191e810c19729de860ee'),
      bigPoppaUser: {
        id: 123
      },
      accounts: {
        github: {
          username: 'runnabot',
          accessToken: 'some-token'
        }
      }
    }
    const dockerComposeContent = {
      name: 'docker-compose.yml',
      path: 'docker-compose.yml',
      sha: '13ec49b1014891c7b494126226f95e318e1d3e82',
      size: 193,
      url: 'https://api.github.com/repos/Runnable/compose-test-repo-1.2/contents/docker-compose.yml?ref=master',
      html_url: 'https://github.com/Runnable/compose-test-repo-1.2/blob/master/docker-compose.yml',
      git_url: 'https://api.github.com/repos/Runnable/compose-test-repo-1.2/git/blobs/13ec49b1014891c7b494126226f95e318e1d3e82',
      download_url: 'https://raw.githubusercontent.com/Runnable/compose-test-repo-1.2/master/docker-compose.yml',
      type: 'file',
      content: 'dmVyc2lvbjogJzInCnNlcnZpY2VzOgogIHdlYjoKICAgIGJ1aWxkOiAnLi9z\ncmMvJwogICAgY29tbWFuZDogW25vZGUsIGluZGV4LmpzXQogICAgcG9ydHM6\nCiAgICAgIC0gIjUwMDA6NTAwMCIKICAgIGVudmlyb25tZW50OgogICAgICAt\nIE5PREVfRU5WPWRldmVsb3BtZW50CiAgICAgIC0gU0hPVz10cnVlCiAgICAg\nIC0gSEVMTE89Njc4Cg==\n',
      encoding: 'base64',
      _links:
       { self: 'https://api.github.com/repos/Runnable/compose-test-repo-1.2/contents/docker-compose.yml?ref=master',
         git: 'https://api.github.com/repos/Runnable/compose-test-repo-1.2/git/blobs/13ec49b1014891c7b494126226f95e318e1d3e82',
         html: 'https://github.com/Runnable/compose-test-repo-1.2/blob/master/docker-compose.yml'
       }
    }
    const triggeredAction = 'webhook'
    const dockerComposeFileString = 'version: \'2\'\nservices:\n  web:\n    build: \'./src/\'\n    command: [node, index.js]\n    ports:\n      - "5000:5000"\n    environment:\n      - NODE_ENV=development\n      - SHOW=true\n      - HELLO=678\n'
    const orgName = 'Runnable'
    const ownerUsername = orgName.toLowerCase()
    const repoName = 'api'
    const repoFullName = orgName + '/' + repoName
    const branchName = 'feature-1'
    const newInstanceName = 'api-unit'
    beforeEach(function (done) {
      sinon.stub(DockerComposeCluster, 'createAsync').resolves(new DockerComposeCluster(clusterData))
      sinon.stub(GitHub.prototype, 'getRepoContentAsync').resolves(dockerComposeContent)
      sinon.stub(octobear, 'parse').returns(testParsedContent)
      sinon.stub(rabbitMQ, 'clusterCreated').returns()
      done()
    })
    afterEach(function (done) {
      DockerComposeCluster.createAsync.restore()
      GitHub.prototype.getRepoContentAsync.restore()
      octobear.parse.restore()
      rabbitMQ.clusterCreated.restore()
      done()
    })
    describe('errors', function () {
      it('should return error if getRepoContentAsync failed', function (done) {
        const error = new Error('Some error')
        GitHub.prototype.getRepoContentAsync.rejects(error)
        DockerComposeClusterService.create(sessionUser, triggeredAction, repoFullName, branchName, dockerComposeFilePath, newInstanceName)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })

      it('should return error if octobear.parse failed', function (done) {
        const error = new Error('Some error')
        octobear.parse.throws(error)
        DockerComposeClusterService.create(sessionUser, triggeredAction, repoFullName, branchName, dockerComposeFilePath, newInstanceName)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })

      it('should return error if createAsync failed', function (done) {
        const error = new Error('Some error')
        DockerComposeCluster.createAsync.rejects(error)
        DockerComposeClusterService.create(sessionUser, triggeredAction, repoFullName, branchName, dockerComposeFilePath, newInstanceName)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })

      it('should return error if clusterCreared failed', function (done) {
        const error = new Error('Some error')
        rabbitMQ.clusterCreated.throws(error)
        DockerComposeClusterService.create(sessionUser, triggeredAction, repoFullName, branchName, dockerComposeFilePath, newInstanceName)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })
    })
    describe('success', function () {
      it('should run successfully', function (done) {
        DockerComposeClusterService.create(sessionUser, triggeredAction, repoFullName, branchName, dockerComposeFilePath, newInstanceName).asCallback(done)
      })

      it('should call getRepoContentAsync with correct args', function (done) {
        DockerComposeClusterService.create(sessionUser, triggeredAction, repoFullName, branchName, dockerComposeFilePath, newInstanceName)
        .tap(function () {
          sinon.assert.calledOnce(GitHub.prototype.getRepoContentAsync)
          sinon.assert.calledWithExactly(GitHub.prototype.getRepoContentAsync, repoFullName, dockerComposeFilePath)
        })
        .asCallback(done)
      })

      it('should call octobear.parse with correct args', function (done) {
        DockerComposeClusterService.create(sessionUser, triggeredAction, repoFullName, branchName, dockerComposeFilePath, newInstanceName)
        .tap(function () {
          sinon.assert.calledOnce(octobear.parse)
          const parserPayload = {
            dockerComposeFileString,
            repositoryName: newInstanceName,
            ownerUsername: ownerUsername,
            userContentDomain: process.env.USER_CONTENT_DOMAIN
          }
          sinon.assert.calledWithExactly(octobear.parse, parserPayload)
        })
        .asCallback(done)
      })

      it('should call createAsync with correct args', function (done) {
        DockerComposeClusterService.create(sessionUser, triggeredAction, repoFullName, branchName, dockerComposeFilePath, newInstanceName)
        .tap(function () {
          sinon.assert.calledOnce(DockerComposeCluster.createAsync)
          sinon.assert.calledWithExactly(DockerComposeCluster.createAsync, {
            dockerComposeFilePath,
            createdBy: sessionUser.bigPoppaUser.id,
            triggeredAction })
        })
        .asCallback(done)
      })

      it('should call clusterCreated with correct args', function (done) {
        DockerComposeClusterService.create(sessionUser, triggeredAction, repoFullName, branchName, dockerComposeFilePath, newInstanceName)
        .tap(function () {
          sinon.assert.calledOnce(rabbitMQ.clusterCreated)
          const cluster = { id: clusterId.toString() }
          const payload = {
            cluster,
            parsedCompose: testParsedContent
          }
          sinon.assert.calledWithExactly(rabbitMQ.clusterCreated, payload)
        })
        .asCallback(done)
      })

      it('should call all the functions in the order', function (done) {
        DockerComposeClusterService.create(sessionUser, triggeredAction, repoFullName, branchName, dockerComposeFilePath, newInstanceName)
        .tap(function () {
          sinon.assert.callOrder(
            GitHub.prototype.getRepoContentAsync,
            octobear.parse,
            DockerComposeCluster.createAsync,
            rabbitMQ.clusterCreated)
        })
        .asCallback(done)
      })
    })
  })
  let testSessionUser
  const testOrgGithubId = 111
  const testBpOrgId = 222
  const testOrgName = 'Runnable'

  beforeEach((done) => {
    testSessionUser = {
      _id: 'id',
      accounts: {
        github: {
          id: testOrgGithubId
        },
        login: 'login',
        username: 'best'
      },
      bigPoppaUser: {
        organizations: [{
          name: testOrgName,
          lowerName: testOrgName.toLowerCase(),
          id: testBpOrgId,
          githubId: testOrgGithubId
        }]
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
      const testRepoName = 'Runnable/boo'
      const testInstance = { _id: 'instance' }
      const testBuild = { _id: 'build' }
      const testContext = { _id: 'context' }
      const testContextVersion = { _id: 'contextVersion' }

      DockerComposeClusterService._createParentInstance.resolves(testInstance)
      DockerComposeClusterService._createParentBuild.resolves(testBuild)
      DockerComposeClusterService._createParentContextVersion.resolves(testContextVersion)
      DockerComposeClusterService._createParentContext.resolves(testContext)

      DockerComposeClusterService.createClusterParent(testSessionUser, testMainParsedContent, testRepoName).asCallback((err, instance) => {
        if (err) { return done(err) }
        expect(instance).to.equal(testInstance)
        sinon.assert.calledOnce(DockerComposeClusterService._createParentContext)
        sinon.assert.calledWith(DockerComposeClusterService._createParentContext, testSessionUser, testBpOrgId, testOrgGithubId)
        sinon.assert.calledOnce(DockerComposeClusterService._createParentContextVersion)
        sinon.assert.calledWith(DockerComposeClusterService._createParentContextVersion, testSessionUser, testContext._id, testOrgGithubId, testRepoName, testMainParsedContent.contextVersion.buildDockerfilePath)
        sinon.assert.calledOnce(DockerComposeClusterService._createParentBuild)
        sinon.assert.calledWith(DockerComposeClusterService._createParentBuild, testSessionUser, testContextVersion._id)
        sinon.assert.calledOnce(DockerComposeClusterService._createParentInstance)
        sinon.assert.calledWith(DockerComposeClusterService._createParentInstance, testSessionUser, testMainParsedContent.instance, testBuild._id)
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

      DockerComposeClusterService._createParentContext(testSessionUser, testBpOrgId, testOrgGithubId).asCallback((err, context) => {
        if (err) { return done(err) }
        sinon.assert.calledOnce(ContextService.createNew)
        sinon.assert.calledWith(ContextService.createNew, testSessionUser, sinon.match({
          name: sinon.match.string,
          owner: {
            github: testOrgGithubId,
            bigPoppa: testBpOrgId
          }
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
      const testDockerfilePath = '/Dockerfile'

      ContextVersion.createAppcodeVersion.resolves(testAppCodeVersion)
      ContextVersion.createWithNewInfraCode.resolves(testContextVersion)

      DockerComposeClusterService._createParentContextVersion(testSessionUser, testContextId, testOrgGithubId, testRepoName, testDockerfilePath).asCallback((err, contextVersion) => {
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
          advance: true,
          buildDockerfilePath: testDockerfilePath,
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
        ports: 'ports',
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
          ports: testParentComposeData.ports,
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
