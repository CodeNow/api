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

const AutoIsolationConfig = require('models/mongo/auto-isolation-config')
const AutoIsolationService = require('models/services/auto-isolation-service')
const InputClusterConfig = require('models/mongo/input-cluster-config')
const ClusterConfigService = require('models/services/cluster-config-service')
const rabbitMQ = require('models/rabbitmq')
const GitHub = require('models/apis/github')
const octobear = require('@runnable/octobear')
const BuildService = require('models/services/build-service')
const ContextService = require('models/services/context-service')
const ContextVersion = require('models/mongo/context-version')
const InfraCodeVersionService = require('models/services/infracode-version-service')
const InstanceService = require('models/services/instance-service')
const UserService = require('models/services/user-service')

require('sinon-as-promised')(Promise)

describe('Cluster Config Service Unit Tests', function () {
  const testOrgGithubId = 111
  const testUserGithubId = 333
  const testOrgBpId = 222
  const testUserBpId = 444
  const testOrgName = 'Runnable'
  const testContextId = objectId('407f191e810c19729de860ef')
  const isTesting = true
  const isTestReporter = false
  const parentInputClusterConfigId = 'dk2kj3492'
  const testReporters = []
  let testOrgInfo

  let testMainParsedContent
  let testDepParsedContent
  let testParsedContent
  let testSessionUser
  const testOrg = {
    id: testOrgBpId
  }

  beforeEach((done) => {
    testSessionUser = {
      _id: 'id',
      accounts: {
        github: {
          id: testUserGithubId,
          accessToken: 'some-token'
        },
        login: 'login',
        username: 'best'
      },
      bigPoppaUser: {
        id: testUserBpId,
        organizations: [{
          name: testOrgName,
          lowerName: testOrgName.toLowerCase(),
          id: testOrgBpId,
          githubId: testOrgGithubId
        }]
      }
    }

    testOrgInfo = {
      githubOrgId: testOrgGithubId,
      bigPoppaOrgId: testOrgBpId
    }

    testMainParsedContent = {
      metadata: {
        name: 'api',
        isMain: true,
        envFiles: []
      },
      buildDockerfilePath: '.',
      files: { // Optional
        '/Dockerfile': {
          body: 'FROM node'
        }
      },
      instance: {
        name: 'api',
        aliases: {
          'dGhyZWUtY2hhbmdpbmctdGhlLWhvc3RuYW1l': {
            'instanceName': 'api-workers',
            'alias': 'three-changing-the-hostname'
          }
        },
        containerStartCommand: 'npm start',
        ports: [80],
        env: ['HELLO=WORLD']
      }
    }
    testDepParsedContent = {
      metadata: {
        name: 'workers',
        isMain: false,
        envFiles: []
      },
      buildDockerfilePath: '.',
      files: { // Optional
        '/Dockerfile': {
          body: 'FROM node'
        }
      },
      instance: {
        name: 'api-workers',
        aliases: {
          'dGhyZWUtY2hhbmdpbmctdGhlLWhvc3RuYW1l': {
            'instanceName': 'compose-test-5-1-rethinkdb4',
            'alias': 'three-changing-the-hostname'
          }
        },
        containerStartCommand: 'npm start-workers',
        ports: [80],
        env: ['HELLO=WORLD']
      }
    }
    testParsedContent = {
      results: [testMainParsedContent, testDepParsedContent],
      envFiles: []
    }
    done()
  })

  describe('create', function () {
    const filePath = 'config/compose.yml'
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
    const fileString = 'version: \'2\'\nservices:\n  web:\n    build: \'./src/\'\n    command: [node, index.js]\n    ports:\n      - "5000:5000"\n    environment:\n      - NODE_ENV=development\n      - SHOW=true\n      - HELLO=678\n'
    const orgName = 'runnable'
    const ownerUsername = orgName.toLowerCase()
    const repoName = 'api'
    const repoFullName = orgName + '/' + repoName
    const branchName = 'feature-1'
    const clusterName = 'api-unit'
    const parsedInput = {
      repositoryName: clusterName,
      ownerUsername: orgName,
      userContentDomain: process.env.USER_CONTENT_DOMAIN,
      fileSha: dockerComposeContent.sha,
      fileString: fileString
    }

    const testData = {
      triggeredAction, repoFullName, branchName, filePath, isTesting, testReporters, clusterName, parentInputClusterConfigId
    }

    beforeEach(function (done) {
      sinon.stub(GitHub.prototype, 'getRepoContent').resolves(dockerComposeContent)
      sinon.stub(octobear, 'parse').resolves(testParsedContent)
      sinon.stub(ClusterConfigService, 'createFromRunnableConfig').resolves()
      done()
    })
    afterEach(function (done) {
      GitHub.prototype.getRepoContent.restore()
      octobear.parse.restore()
      ClusterConfigService.createFromRunnableConfig.restore()
      done()
    })
    describe('errors', function () {
      it('should return error if getRepoContent failed', function (done) {
        const error = new Error('Some error')
        GitHub.prototype.getRepoContent.rejects(error)
        ClusterConfigService.create(testSessionUser, testData)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })

      it('should return error if octobear.parse failed', function (done) {
        const error = new Error('Some error')
        octobear.parse.throws(error)
        ClusterConfigService.create(testSessionUser, testData)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })

      it('should return error if createFromRunnableConfig failed', function (done) {
        const error = new Error('Some error')
        ClusterConfigService.createFromRunnableConfig.rejects(error)
        ClusterConfigService.create(testSessionUser, testData)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })
    })

    describe('success', function () {
      it('should run successfully', function (done) {
        ClusterConfigService.create(testSessionUser, testData).asCallback(done)
      })

      it('should call getRepoContent with correct args', function (done) {
        ClusterConfigService.create(testSessionUser, testData)
        .tap(function () {
          sinon.assert.calledOnce(GitHub.prototype.getRepoContent)
          sinon.assert.calledWithExactly(GitHub.prototype.getRepoContent, repoFullName, filePath, undefined)
        })
        .asCallback(done)
      })

      it('should call octobear.parse with correct args', function (done) {
        ClusterConfigService.create(testSessionUser, testData)
        .tap(function () {
          sinon.assert.calledOnce(octobear.parse)
          const parserPayload = {
            dockerComposeFileString: fileString,
            dockerComposeFilePath: filePath,
            repositoryName: clusterName,
            ownerUsername: ownerUsername,
            userContentDomain: process.env.USER_CONTENT_DOMAIN,
            scmDomain: process.env.GITHUB_HOST
          }
          sinon.assert.calledWithExactly(octobear.parse, parserPayload)
        })
        .asCallback(done)
      })

      it('should call ClusterConfigService.createFromRunnableConfig with correct args', function (done) {
        ClusterConfigService.create(testSessionUser, testData)
        .tap(function () {
          sinon.assert.calledOnce(ClusterConfigService.createFromRunnableConfig)
          sinon.assert.calledWithExactly(
            ClusterConfigService.createFromRunnableConfig,
            testSessionUser,
            { results: testParsedContent.results }, // `envFiles` property removed
            triggeredAction,
            repoFullName,
            filePath,
            parsedInput.fileSha,
            clusterName,
            isTesting,
            testReporters,
            parentInputClusterConfigId
          )
        })
        .asCallback(done)
      })

      it('should call all the functions in the order', function (done) {
        ClusterConfigService.create(testSessionUser, testData)
        .tap(function () {
          sinon.assert.callOrder(
            GitHub.prototype.getRepoContent,
            octobear.parse,
            ClusterConfigService.createFromRunnableConfig)
        })
        .asCallback(done)
      })
    })
  })

  describe('createFromRunnableConfig', function () {
    const autoIsolationConfigId = objectId('107f191e810c19729de860ee')
    const clusterConfigId = objectId('407f191e810c19729de860ef')
    const parentInstanceId = objectId('507f191e810c19729de860ea')
    const depInstanceId1 = objectId('607f191e810c19729de860eb')
    const filePath = 'config/compose.yml'
    const triggeredAction = 'webhook'
    const isTesting = false
    const isTestReporter = false
    const composeConfigData = {
      _id: clusterConfigId,
      filePath: filePath
    }
    const fileSha = 'asdfasdfadsfase3kj3lkj4qwdfalk3fawhsdfkjsd'
    const composeData = {
      repositoryName: 'sdasdasd',
      fileSha: fileSha
    }
    const autoIsolationConfigData = {
      _id: autoIsolationConfigId,
      instance: parentInstanceId,
      requestedDependencies: [
        {
          instance: depInstanceId1
        }
      ]
    }
    const orgName = 'Runnable'
    const repoName = 'api'
    const bigPoppaOwnerObject = {
      githubId: testOrgGithubId,
      id: testOrgBpId
    }
    const repoFullName = orgName + '/' + repoName
    beforeEach(function (done) {
      const instanceCreate = sinon.stub(ClusterConfigService, 'createClusterInstance')
      instanceCreate.onCall(0).resolves({
        _id: parentInstanceId
      })
      instanceCreate.onCall(1).resolves({
        _id: depInstanceId1
      })
      sinon.stub(ClusterConfigService, 'createClusterContext').resolves()
      sinon.stub(ClusterConfigService, 'addAliasesToContexts').resolves()
      sinon.stub(UserService, 'getBpOrgInfoFromRepoName').returns(bigPoppaOwnerObject)
      sinon.stub(InputClusterConfig, 'createAsync').resolves(new InputClusterConfig(composeConfigData))
      sinon.stub(AutoIsolationService, 'createOrUpdateAndEmit').resolves(new AutoIsolationConfig(autoIsolationConfigData))
      done()
    })
    afterEach(function (done) {
      ClusterConfigService.createClusterContext.restore()
      ClusterConfigService.addAliasesToContexts.restore()
      UserService.getBpOrgInfoFromRepoName.restore()
      InputClusterConfig.createAsync.restore()
      AutoIsolationService.createOrUpdateAndEmit.restore()
      ClusterConfigService.createClusterInstance.restore()
      done()
    })
    describe('errors', function () {
      it('should return error if createClusterInstance failed', function (done) {
        const error = new Error('Some error')
        ClusterConfigService.createClusterInstance.onCall(0).rejects(error)
        ClusterConfigService.createClusterInstance.onCall(1).rejects(error)
        ClusterConfigService.createFromRunnableConfig(testSessionUser, testParsedContent, triggeredAction, repoFullName, filePath, fileSha, composeData.repositoryName, isTesting, testReporters)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })

      it('should return error if AutoIsolationService.createOrUpdateAndEmit failed', function (done) {
        const error = new Error('Some error')
        AutoIsolationService.createOrUpdateAndEmit.rejects(error)
        ClusterConfigService.createFromRunnableConfig(testSessionUser, testParsedContent, triggeredAction, repoFullName, filePath, fileSha, composeData.repositoryName, isTesting, testReporters)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })

      it('should return error if InputClusterConfig.createAsync failed', function (done) {
        const error = new Error('Some error')
        InputClusterConfig.createAsync.rejects(error)
        ClusterConfigService.createFromRunnableConfig(testSessionUser, testParsedContent, triggeredAction, repoFullName, filePath, fileSha, composeData.repositoryName, isTesting, testReporters)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })
    })
    describe('success', function () {
      it('should run successfully', function (done) {
        ClusterConfigService.createFromRunnableConfig(testSessionUser, testParsedContent, triggeredAction, repoFullName, filePath, fileSha, composeData.repositoryName, isTesting, testReporters).asCallback(done)
      })
      it('should call ClusterConfigService.createClusterContext with correct args', function (done) {
        ClusterConfigService.createFromRunnableConfig(testSessionUser, testParsedContent, triggeredAction, repoFullName, filePath, fileSha, composeData.repositoryName, isTesting, testReporters)
          .tap(function () {
            sinon.assert.calledTwice(ClusterConfigService.createClusterInstance)
            sinon.assert.calledWithExactly(ClusterConfigService.createClusterContext,
              testSessionUser,
              testParsedContent.results[0],
              sinon.match({
                githubOrgId: bigPoppaOwnerObject.githubId,
                bigPoppaOrgId: bigPoppaOwnerObject.id
              }))
            sinon.assert.calledWithExactly(ClusterConfigService.createClusterContext,
              testSessionUser,
              testParsedContent.results[0],
              sinon.match({
                githubOrgId: bigPoppaOwnerObject.githubId,
                bigPoppaOrgId: bigPoppaOwnerObject.id
              }))
          })
          .asCallback(done)
      })
      it('should call ClusterConfigService.addAliasesToContexts with correct args', function (done) {
        ClusterConfigService.createFromRunnableConfig(testSessionUser, testParsedContent, triggeredAction, repoFullName, filePath, fileSha, composeData.repositoryName, isTesting, testReporters)
          .tap(function () {
            sinon.assert.calledOnce(ClusterConfigService.addAliasesToContexts)
            sinon.assert.calledWithExactly(ClusterConfigService.addAliasesToContexts,
              testParsedContent.results
            )
          })
          .asCallback(done)
      })

      it('should call ClusterConfigService.createClusterInstance with correct args', function (done) {
        ClusterConfigService.createFromRunnableConfig(testSessionUser, testParsedContent, triggeredAction, repoFullName, filePath, fileSha, composeData.repositoryName, isTesting, testReporters)
        .tap(function () {
          sinon.assert.calledTwice(ClusterConfigService.createClusterInstance)
          sinon.assert.calledWithExactly(ClusterConfigService.createClusterInstance,
            testSessionUser,
            testParsedContent.results[0],
            repoFullName,
            isTesting,
            isTestReporter,
            triggeredAction)
          sinon.assert.calledWithExactly(ClusterConfigService.createClusterInstance,
            testSessionUser,
            testParsedContent.results[1],
            repoFullName,
            false,
            false,
            triggeredAction)
        })
        .asCallback(done)
      })

      it('should call AutoIsolationService.createOrUpdateAndEmit correct args', function (done) {
        ClusterConfigService.createFromRunnableConfig(testSessionUser, testParsedContent, triggeredAction, repoFullName, filePath, fileSha, composeData, isTesting, testReporters)
        .tap(function () {
          sinon.assert.calledOnce(AutoIsolationService.createOrUpdateAndEmit)
          const autoIsolationOpts = {
            createdByUser: testSessionUser.bigPoppaUser.id,
            ownedByOrg: testOrg.id,
            instance: parentInstanceId,
            redeployOnKilled: false,
            requestedDependencies: [
              {
                instance: depInstanceId1
              }
            ]
          }
          sinon.assert.calledWithExactly(AutoIsolationService.createOrUpdateAndEmit, autoIsolationOpts)
        })
        .asCallback(done)
      })

      it('should call AutoIsolationService.createOrUpdateAndEmit correct args and set matchBranch', function (done) {
        const depParsedContent = Object.assign({}, testDepParsedContent)
        delete depParsedContent.files
        const parsedContent = {
          results: [testMainParsedContent, depParsedContent]
        }
        ClusterConfigService.createFromRunnableConfig(testSessionUser, parsedContent, triggeredAction, repoFullName, filePath, fileSha, composeData, isTesting, testReporters)
          .tap(function () {
            sinon.assert.calledOnce(AutoIsolationService.createOrUpdateAndEmit)
            const autoIsolationOpts = {
              createdByUser: testSessionUser.bigPoppaUser.id,
              ownedByOrg: testOrg.id,
              instance: parentInstanceId,
              redeployOnKilled: false,
              requestedDependencies: [
                {
                  instance: depInstanceId1
                }
              ]
            }
            sinon.assert.calledWithExactly(AutoIsolationService.createOrUpdateAndEmit, autoIsolationOpts)
          })
          .asCallback(done)
      })

      it('should call InputClusterConfig.createAsync with correct args', function (done) {
        ClusterConfigService.createFromRunnableConfig(testSessionUser, testParsedContent, triggeredAction, repoFullName, filePath, fileSha, composeData.repositoryName, isTesting, testReporters, parentInputClusterConfigId)
        .tap(function () {
          sinon.assert.calledOnce(InputClusterConfig.createAsync)
          sinon.assert.calledWithExactly(InputClusterConfig.createAsync, {
            autoIsolationConfigId,
            filePath,
            createdByUser: testSessionUser.bigPoppaUser.id,
            ownedByOrg: testOrg.id,
            fileSha,
            isTesting: false,
            clusterName: composeData.repositoryName,
            parentInputClusterConfigId
          })
        })
        .asCallback(done)
      })

      it('should call all the functions in the order', function (done) {
        ClusterConfigService.createFromRunnableConfig(testSessionUser, testParsedContent, triggeredAction, repoFullName, filePath, fileSha, composeData, isTesting, testReporters)
        .tap(function () {
          sinon.assert.callOrder(
            ClusterConfigService.createClusterInstance,
            AutoIsolationService.createOrUpdateAndEmit,
            InputClusterConfig.createAsync)
        })
        .asCallback(done)
      })
    })
  })

  describe('addAliasesToContexts', function () {
    const mainContextId = objectId('107f191e810c19729de86011')
    const depContextId = objectId('107f191e810c19729de86012')
    beforeEach(function (done) {
      testMainParsedContent.contextId = mainContextId
      testDepParsedContent.contextId = depContextId
      done()
    })
    describe('success', function () {
      it('should run successfully', function (done) {
        ClusterConfigService.addAliasesToContexts([testMainParsedContent, testDepParsedContent])
        expect(testMainParsedContent.instance.aliases.dGhyZWUtY2hhbmdpbmctdGhlLWhvc3RuYW1l.contextId).to.equal(depContextId)
        expect(testDepParsedContent.instance.aliases.dGhyZWUtY2hhbmdpbmctdGhlLWhvc3RuYW1l.contextId).to.be.undefined()
        done()
      })
      it('shouldn\'t fail if no configs given', function (done) {
        ClusterConfigService.addAliasesToContexts()
        done()
      })
      it('shouldn\'t fail if no configs with aliases are given', function (done) {
        delete testMainParsedContent.instance.aliases
        delete testDepParsedContent.instance.aliases
        ClusterConfigService.addAliasesToContexts([testMainParsedContent, testDepParsedContent])
        done()
      })
      it('should connect both configs together when they reference each other', function (done) {
        // make the other connection
        testDepParsedContent.instance.aliases.dGhyZWUtY2hhbmdpbmctdGhlLWhvc3RuYW1l.instanceName = testMainParsedContent.metadata.name
        ClusterConfigService.addAliasesToContexts([testMainParsedContent, testDepParsedContent])
        expect(testMainParsedContent.instance.aliases.dGhyZWUtY2hhbmdpbmctdGhlLWhvc3RuYW1l.contextId).to.equal(depContextId)
        expect(testDepParsedContent.instance.aliases.dGhyZWUtY2hhbmdpbmctdGhlLWhvc3RuYW1l.contextId).to.equal(mainContextId)
        done()
      })
    })
  })
  describe('createClusterInstance', () => {
    beforeEach((done) => {
      sinon.stub(ClusterConfigService, '_createContextVersion')
      sinon.stub(ClusterConfigService, '_createBuild')
      sinon.stub(BuildService, 'buildBuild')
      sinon.stub(ClusterConfigService, '_createInstance')
      done()
    })

    afterEach((done) => {
      ClusterConfigService._createInstance.restore()
      ClusterConfigService._createBuild.restore()
      ClusterConfigService._createContextVersion.restore()
      BuildService.buildBuild.restore()
      done()
    })

    it('should create cluster instance', (done) => {
      const testRepoName = 'Runnable/boo'
      const testInstance = { _id: 'instance' }
      const testBuild = { _id: objectId('407f191e810c19729de860ef') }
      const testContext = { _id: 'context' }
      const testContextVersion = { _id: 'contextVersion' }
      const testTriggeredAction = 'user'

      ClusterConfigService._createInstance.resolves(testInstance)
      ClusterConfigService._createBuild.resolves(testBuild)
      BuildService.buildBuild.resolves(testBuild)
      ClusterConfigService._createContextVersion.resolves(testContextVersion)
      testMainParsedContent.contextId = testContext._id

      ClusterConfigService.createClusterInstance(testSessionUser, testMainParsedContent, testRepoName, isTesting, isTestReporter, testTriggeredAction).asCallback((err, instance) => {
        if (err) { return done(err) }
        expect(instance).to.equal(testInstance)
        sinon.assert.calledOnce(ClusterConfigService._createContextVersion)
        sinon.assert.calledWithExactly(ClusterConfigService._createContextVersion, testSessionUser, testContext._id, testOrgInfo, testRepoName, testMainParsedContent)
        sinon.assert.calledOnce(ClusterConfigService._createBuild)
        sinon.assert.calledWithExactly(ClusterConfigService._createBuild, testSessionUser, testContextVersion._id, testOrgInfo.githubOrgId)
        sinon.assert.calledOnce(BuildService.buildBuild)
        const buildData = {
          message: 'Initial Cluster Creation',
          noCache: true,
          triggeredAction: {
            manual: testTriggeredAction === 'user'
          }
        }
        sinon.assert.calledWithExactly(BuildService.buildBuild, testBuild._id, buildData, testSessionUser)
        sinon.assert.calledOnce(ClusterConfigService._createInstance)
        sinon.assert.calledWithExactly(ClusterConfigService._createInstance, testSessionUser, testMainParsedContent.instance, testBuild._id.toString(), isTesting, isTestReporter)
        done()
      })
    })
  }) // end createClusterInstance

  describe('_createContext', () => {
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

      ClusterConfigService._createContext(testSessionUser, {
        githubOrgId: testOrgGithubId,
        bigPoppaOrgId: testOrgBpId
      }).asCallback((err, context) => {
        if (err) { return done(err) }
        sinon.assert.calledOnce(ContextService.createNew)
        sinon.assert.calledWith(ContextService.createNew, testSessionUser, sinon.match({
          name: sinon.match.string,
          owner: {
            github: testOrgGithubId,
            bigPoppa: testOrgBpId
          }
        }))

        expect(context).to.equal(testContext)
        done()
      })
    })
  }) // end _createContext

  describe('_createContextVersion', () => {
    let testContextVersion = { _id: 'contextVersion' }
    let testAppCodeVersion = { _id: 'testAppCodeVersion' }
    let testParentInfraCodeVersion = { _id: 'infraCodeVersion' }
    let testDockerfileContent
    beforeEach((done) => {
      sinon.stub(ContextVersion, 'createAppcodeVersion').resolves(testAppCodeVersion)
      sinon.stub(ContextVersion, 'createWithNewInfraCode').resolves(testContextVersion)
      sinon.stub(InfraCodeVersionService, 'findBlankInfraCodeVersion').resolves(testParentInfraCodeVersion)
      sinon.spy(ClusterConfigService, '_createDockerfileContent')
      testDockerfileContent = testMainParsedContent.files['/Dockerfile'].body
      sinon.stub(ContextVersion, 'createWithDockerFileContent').resolves(testContextVersion)
      done()
    })

    afterEach((done) => {
      ContextVersion.createAppcodeVersion.restore()
      ContextVersion.createWithNewInfraCode.restore()
      ClusterConfigService._createDockerfileContent.restore()
      InfraCodeVersionService.findBlankInfraCodeVersion.restore()
      ContextVersion.createWithDockerFileContent.restore()
      done()
    })

    describe('success', () => {
      it('should call ContextVersion.createWithNewInfraCode if no Dockerfile was provided', (done) => {
        const testRepoName = 'runnable/boo'
        const testDockerfilePath = '/Dockerfile'
        const testParsedComposeData = {
          buildDockerfilePath: testDockerfilePath
        }
        ClusterConfigService._createContextVersion(testSessionUser, testContextId, testOrgInfo, testRepoName, testParsedComposeData)
        .tap((contextVersion) => {
          expect(contextVersion).to.equal(testContextVersion)
          sinon.assert.calledOnce(ContextVersion.createAppcodeVersion)
          sinon.assert.calledWithExactly(ContextVersion.createAppcodeVersion, testSessionUser, testRepoName, null)
          sinon.assert.calledOnce(InfraCodeVersionService.findBlankInfraCodeVersion)
          sinon.assert.calledWithExactly(InfraCodeVersionService.findBlankInfraCodeVersion)
          sinon.assert.calledOnce(ContextVersion.createWithNewInfraCode)
          sinon.assert.calledWithExactly(ContextVersion.createWithNewInfraCode, {
            context: testContextId,
            createdBy: {
              github: testSessionUser.accounts.github.id,
              bigPoppa: testSessionUser.bigPoppaUser.id
            },
            owner: {
              github: testOrgGithubId,
              bigPoppa: testOrgBpId
            },
            advanced: true,
            buildDockerfilePath: testDockerfilePath,
            appCodeVersions: [testAppCodeVersion]
          }, { parent: testParentInfraCodeVersion._id, edited: true })
        }).asCallback(done)
      })

      it('should call ContextVersion.createWithDockerFileContent if Dockefile was provided', (done) => {
        const testRepoName = 'runnable/boo'
        const testParsedComposeData = {
          contextVersion: {
            advanced: true
          },
          files: {
            '/Dockerfile': {
              body: testDockerfileContent
            }
          }
        }
        ClusterConfigService._createContextVersion(testSessionUser, testContextId, testOrgInfo, testRepoName, testParsedComposeData)
        .tap((contextVersion) => {
          expect(contextVersion).to.equal(testContextVersion)
          sinon.assert.notCalled(ContextVersion.createAppcodeVersion)
          sinon.assert.calledOnce(InfraCodeVersionService.findBlankInfraCodeVersion)
          sinon.assert.calledWithExactly(InfraCodeVersionService.findBlankInfraCodeVersion)
          sinon.assert.calledOnce(ContextVersion.createWithDockerFileContent)
          sinon.assert.calledWithExactly(ContextVersion.createWithDockerFileContent, {
            context: testContextId,
            createdBy: {
              github: testSessionUser.accounts.github.id,
              bigPoppa: testSessionUser.bigPoppaUser.id
            },
            owner: {
              github: testOrgGithubId,
              bigPoppa: testOrgBpId
            },
            advanced: true
          }, testDockerfileContent, { edited: true, parent: testParentInfraCodeVersion._id })
        }).asCallback(done)
      })

      it('should call all functions in order if Dockerfile was not specified', (done) => {
        const testRepoName = 'runnable/boo'
        const testDockerfilePath = '/Dockerfile'
        const testParsedComposeData = {
          buildDockerfilePath: testDockerfilePath
        }
        ClusterConfigService._createContextVersion(testSessionUser, testContextId, testOrgInfo, testRepoName, testParsedComposeData)
        .tap((contextVersion) => {
          expect(contextVersion).to.equal(testContextVersion)
          sinon.assert.callOrder(
            InfraCodeVersionService.findBlankInfraCodeVersion,
            ContextVersion.createAppcodeVersion,
            ContextVersion.createWithNewInfraCode)
        }).asCallback(done)
      })

      it('should call all functions in order if Dockerfile was specified', (done) => {
        const testRepoName = 'runnable/boo'
        const testParsedComposeData = {
          contextVersion: {
            advanced: true
          },
          files: {
            '/Dockerfile': {
              body: testDockerfileContent
            }
          }
        }
        ClusterConfigService._createContextVersion(testSessionUser, testContextId, testOrgInfo, testRepoName, testParsedComposeData)
        .tap((contextVersion) => {
          expect(contextVersion).to.equal(testContextVersion)
          sinon.assert.callOrder(
            InfraCodeVersionService.findBlankInfraCodeVersion,
            ContextVersion.createWithDockerFileContent)
        }).asCallback(done)
      })
      it('should call _createDockerfileContent after createAppcodeVersion if the config metadata isMain is true', (done) => {
        const testRepoName = 'runnable/boo'
        const testParsedComposeDataIsMain = {
          contextVersion: {
            advanced: true
          },
          files: {
            '/Dockerfile': {
              body: testDockerfileContent
            }
          },
          metadata: {
            isMain: true
          }
        }
        ClusterConfigService._createContextVersion(testSessionUser, testContextId, testOrgInfo, testRepoName, testParsedComposeDataIsMain)
          .tap((contextVersion) => {
            expect(contextVersion).to.equal(testContextVersion)
            sinon.assert.callOrder(
              InfraCodeVersionService.findBlankInfraCodeVersion,
              ContextVersion.createAppcodeVersion,
              ClusterConfigService._createDockerfileContent)
          }).asCallback(done)
      })
      it('should not call  before createAppcodeVersion if the config metadata isMain is false', (done) => {
        const testRepoName = 'runnable/boo'
        const testParsedComposeDataIsMain = {
          contextVersion: {
            advanced: true
          },
          files: {
            '/Dockerfile': {
              body: testDockerfileContent
            }
          }
        }
        ClusterConfigService._createContextVersion(testSessionUser, testContextId, testOrgInfo, testRepoName, testParsedComposeDataIsMain)
          .tap((contextVersion) => {
            expect(contextVersion).to.equal(testContextVersion)
            sinon.assert.notCalled(ContextVersion.createAppcodeVersion)
          }).asCallback(done)
      })
    })
  }) // end _createContextVersion

  describe('_createBuild', () => {
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
      const testBuildId = objectId('507f191e810c19729de860ee')
      const testBuild = {
        _id: testBuildId
      }
      BuildService.createBuild.resolves(testBuild)
      ClusterConfigService._createBuild(testSessionUser, testContextVersionId, testOrgGithubId).asCallback((err, build) => {
        if (err) { return done(err) }
        sinon.assert.calledOnce(BuildService.createBuild)
        sinon.assert.calledWith(BuildService.createBuild, {
          contextVersion: testContextVersionId,
          createdBy: {
            github: testUserGithubId
          },
          owner: {
            github: testOrgGithubId
          }
        }, testSessionUser)

        expect(build).to.equal(testBuild)
        done()
      })
    })
  }) // end _createBuild

  describe('_createInstance', () => {
    beforeEach((done) => {
      sinon.stub(InstanceService, 'createInstance')
      done()
    })

    afterEach((done) => {
      InstanceService.createInstance.restore()
      done()
    })

    it('should create instance', (done) => {
      const testParentBuildId = objectId('407f191e810c19729de860ef')
      const testParentComposeData = {
        env: 'env',
        aliases: {
          'dGhyZWUtY2hhbmdpbmctdGhlLWhvc3RuYW1l': {
            'instanceName': 'compose-test-5-1-rethinkdb4',
            'alias': 'three-changing-the-hostname'
          }
        },
        containerStartCommand: 'containerStartCommand',
        name: 'name'
      }
      const testInstance = 'build'
      InstanceService.createInstance.resolves(testInstance)

      ClusterConfigService._createInstance(testSessionUser, testParentComposeData, testParentBuildId.toString(), isTesting, isTestReporter).asCallback((err, instance) => {
        if (err) { return done(err) }
        sinon.assert.calledOnce(InstanceService.createInstance)
        sinon.assert.calledWith(InstanceService.createInstance, {
          build: testParentBuildId.toString(),
          aliases: testParentComposeData.aliases,
          env: testParentComposeData.env,
          containerStartCommand: testParentComposeData.containerStartCommand,
          name: testParentComposeData.name,
          isTesting,
          isTestReporter,
          masterPod: true,
          ipWhitelist: {
            enabled: false
          }
        })

        expect(instance).to.equal(testInstance)
        done()
      })
    })

    it('should create non-test instance', (done) => {
      const isTesting = false
      const testParentBuildId = objectId('407f191e810c19729de860ef')
      const testParentComposeData = {
        env: 'env',
        aliases: {
          'dGhyZWUtY2hhbmdpbmctdGhlLWhvc3RuYW1l': {
            'instanceName': 'compose-test-5-1-rethinkdb4',
            'alias': 'three-changing-the-hostname'
          }
        },
        containerStartCommand: 'containerStartCommand',
        name: 'name'
      }
      const testInstance = 'build'
      InstanceService.createInstance.resolves(testInstance)

      ClusterConfigService._createInstance(testSessionUser, testParentComposeData, testParentBuildId.toString(), isTesting, isTestReporter).asCallback((err, instance) => {
        if (err) { return done(err) }
        sinon.assert.calledOnce(InstanceService.createInstance)
        sinon.assert.calledWith(InstanceService.createInstance, {
          build: testParentBuildId.toString(),
          env: testParentComposeData.env,
          aliases: testParentComposeData.aliases,
          containerStartCommand: testParentComposeData.containerStartCommand,
          name: testParentComposeData.name,
          isTesting,
          isTestReporter,
          masterPod: true,
          ipWhitelist: {
            enabled: false
          }
        })

        expect(instance).to.equal(testInstance)
        done()
      })
    })
  }) // end _createInstance

  // describe('delete', function () {
  //   const clusterConfigId = objectId('407f191e810c19729de860ef')
  //   const parentInstanceId = objectId('507f191e810c19729de860ea')
  //   const composeConfigData = {
  //     _id: clusterConfigId,
  //     filePath: '/config/compose.yml',
  //     parentInstanceId: parentInstanceId,
  //     instancesIds: [
  //       objectId('607f191e810c19729de860eb'),
  //       objectId('707f191e810c19729de860ec')
  //     ]
  //   }
  //   beforeEach(function (done) {
  //     sinon.stub(InputClusterConfig, 'findByIdAndAssert').resolves(new InputClusterConfig(composeConfigData))
  //     sinon.stub(InputClusterConfig, 'markAsDeleted').resolves()
  //     sinon.stub(rabbitMQ, 'deleteInstance').returns()
  //     sinon.stub(rabbitMQ, 'clusterDeleted').returns()
  //     done()
  //   })
  //   afterEach(function (done) {
  //     InputClusterConfig.findByIdAndAssert.restore()
  //     InputClusterConfig.markAsDeleted.restore()
  //     rabbitMQ.deleteInstance.restore()
  //     rabbitMQ.clusterDeleted.restore()
  //     done()
  //   })
  //   describe('errors', function () {
  //     it('should return error if findByIdAndAssert failed', function (done) {
  //       const error = new Error('Some error')
  //       InputClusterConfig.findByIdAndAssert.rejects(error)
  //       ClusterConfigService.delete(clusterConfigId.toString())
  //       .asCallback(function (err) {
  //         expect(err).to.exist()
  //         expect(err.message).to.equal(error.message)
  //         done()
  //       })
  //     })
  //
  //     it('should return error if deleteInstance failed', function (done) {
  //       const error = new Error('Some error')
  //       rabbitMQ.deleteInstance.throws(error)
  //       ClusterConfigService.delete(clusterConfigId.toString())
  //       .asCallback(function (err) {
  //         expect(err).to.exist()
  //         expect(err.message).to.equal(error.message)
  //         done()
  //       })
  //     })
  //
  //     it('should return error if findByIdAndAssert failed', function (done) {
  //       const error = new Error('Some error')
  //       InputClusterConfig.markAsDeleted.rejects(error)
  //       ClusterConfigService.delete(clusterConfigId.toString())
  //       .asCallback(function (err) {
  //         expect(err).to.exist()
  //         expect(err.message).to.equal(error.message)
  //         done()
  //       })
  //     })
  //
  //     it('should return error if clusterDeleted failed', function (done) {
  //       const error = new Error('Some error')
  //       rabbitMQ.clusterDeleted.throws(error)
  //       ClusterConfigService.delete(clusterConfigId.toString())
  //       .asCallback(function (err) {
  //         expect(err).to.exist()
  //         expect(err.message).to.equal(error.message)
  //         done()
  //       })
  //     })
  //   })
  //   describe('success', function () {
  //     it('should run successfully', function (done) {
  //       ClusterConfigService.delete(clusterConfigId.toString()).asCallback(done)
  //     })
  //
  //     it('should call findByIdAndAssert with correct args', function (done) {
  //       ClusterConfigService.delete(clusterConfigId.toString())
  //       .tap(function () {
  //         sinon.assert.calledOnce(InputClusterConfig.findByIdAndAssert)
  //         sinon.assert.calledWithExactly(InputClusterConfig.findByIdAndAssert, clusterConfigId.toString())
  //       })
  //       .asCallback(done)
  //     })
  //
  //     it('should call deleteInstance with correct args', function (done) {
  //       ClusterConfigService.delete(clusterConfigId.toString())
  //       .tap(function () {
  //         sinon.assert.calledTwice(rabbitMQ.deleteInstance)
  //         sinon.assert.calledWithExactly(rabbitMQ.deleteInstance, { instanceId: composeConfigData.instancesIds[0] })
  //         sinon.assert.calledWithExactly(rabbitMQ.deleteInstance, { instanceId: composeConfigData.instancesIds[1] })
  //       })
  //       .asCallback(done)
  //     })
  //
  //     it('should call markAsDeleted with correct args', function (done) {
  //       ClusterConfigService.delete(clusterConfigId.toString())
  //       .tap(function () {
  //         sinon.assert.calledOnce(InputClusterConfig.markAsDeleted)
  //         sinon.assert.calledWithExactly(InputClusterConfig.markAsDeleted, clusterConfigId)
  //       })
  //       .asCallback(done)
  //     })
  //
  //     it('should call clusterDeleted with correct args', function (done) {
  //       ClusterConfigService.delete(clusterConfigId.toString())
  //       .tap(function () {
  //         sinon.assert.calledOnce(rabbitMQ.clusterDeleted)
  //         const cluster = { id: clusterConfigId.toString() }
  //         sinon.assert.calledWithExactly(rabbitMQ.clusterDeleted, { cluster })
  //       })
  //       .asCallback(done)
  //     })
  //
  //     it('should call all the functions in the order', function (done) {
  //       ClusterConfigService.delete(clusterConfigId.toString())
  //       .tap(function () {
  //         sinon.assert.callOrder(
  //           InputClusterConfig.findByIdAndAssert,
  //           rabbitMQ.deleteInstance,
  //           InputClusterConfig.markAsDeleted,
  //           rabbitMQ.clusterDeleted)
  //       })
  //       .asCallback(done)
  //     })
  //   })
  // })

  describe('_updateInstancesWithConfigs', () => {
    let instanceMock
    let testConfig
    let sessionUser
    let instanceObj
    beforeEach((done) => {
      sessionUser = {}
      testConfig = {
        aliases: {
          'dGhyZWUtY2hhbmdpbmctdGhlLWhvc3RuYW1l': {
            'instanceName': 'compose-test-5-1-rethinkdb4',
            'alias': 'three-changing-the-hostname'
          },
          'cmV0aGlua2RiNA==': {
            'instanceName': 'compose-test-5-1-rethinkdb4',
            'alias': 'rethinkdb4'
          },
          'dGhyZWUtY2hhbmdpbmctdGhlLXdlaXJkLWhvc3Q=': {
            'instanceName': 'compose-test-5-1-rethinkdb3',
            'alias': 'three-changing-the-weird-host'
          }
        },
        env: ['env'],
        ports: [123],
        containerStartCommand: 'start',
        name: 'NewName'
      }
      instanceMock = {
        _id: 1,
        updateAsync: sinon.stub().resolves(),
        name: 'test'
      }
      instanceObj = {
        instance: instanceMock,
        config: {
          instance: testConfig
        }
      }
      sinon.stub(InstanceService, 'updateInstance').resolves(instanceMock)
      done()
    })

    afterEach((done) => {
      InstanceService.updateInstance.restore()
      done()
    })

    it('should update instance if it has new config', (done) => {
      ClusterConfigService._updateInstancesWithConfigs(sessionUser, instanceObj)
        .then(() => {
          sinon.assert.calledOnce(InstanceService.updateInstance)
          sinon.assert.calledWith(InstanceService.updateInstance,
            instanceMock, {
              aliases: testConfig.aliases,
              env: testConfig.env,
              ports: testConfig.ports,
              containerStartCommand: testConfig.containerStartCommand
            },
            sessionUser
          )
        })
        .asCallback(done)
    })
  }) // end _updateInstancesWithConfigs

  // describe('_createNewInstancesForNewConfigs', () => {
  //   beforeEach((done) => {
  //     sinon.stub(rabbitMQ, 'createClusterInstance')
  //     done()
  //   })
  //
  //   afterEach((done) => {
  //     rabbitMQ.createClusterInstance.restore()
  //     done()
  //   })
  //
  //   it('should call create if instance does not have a name', (done) => {
  //     testMainParsedContent.config = testMainParsedContent
  //     ClusterConfigService._createNewInstancesForNewConfigs({
  //       config: testMainParsedContent
  //     }, testOrgBpId)
  //
  //     sinon.assert.calledOnce(rabbitMQ.createClusterInstance)
  //     sinon.assert.calledWith(rabbitMQ.createClusterInstance, {
  //       parsedComposeData: testMainParsedContent,
  //       bigPoppaOrgId: testOrgBpId
  //     })
  //     done()
  //   })
  //
  //   it('should not call create if instance missing name', (done) => {
  //     delete testMainParsedContent.name
  //     ClusterConfigService._createNewInstancesForNewConfigs(testMainParsedContent, 1)
  //     sinon.assert.notCalled(rabbitMQ.createClusterInstance)
  //     done()
  //   })
  //
  //   it('should not call create if instance missing config', (done) => {
  //     ClusterConfigService._createNewInstancesForNewConfigs(testMainParsedContent, 1)
  //     sinon.assert.notCalled(rabbitMQ.createClusterInstance)
  //     done()
  //   })
  // }) // end _createNewInstancesForNewConfigs

  describe('_mergeConfigsIntoInstances', () => {
    it('should output list of configs and instances', (done) => {
      const out = ClusterConfigService._mergeConfigsIntoInstances(
        [{instance: {name: '1'}}, {instance: {name: '4'}}],
        [{name: '1'}, {name: '2'}]
      )
      expect(out).to.equal([
        {instance: { name: '1'}, config: {instance: {name: '1'}, contextId: null}},
        {instance: { name: '2'}, config: undefined},
        {config: {instance: {name: '4'}}}
      ])
      done()
    })
  }) // end _mergeConfigsIntoInstances

  describe('_addConfigToInstances', () => {
    it('should add instances and missing configs into array', (done) => {
      const out = ClusterConfigService._addConfigToInstances(
        [{instance: {name: '1'}}, {instance: {name: '4'}}],
        [{name: '1'}, {name: '2'}]
      )
      expect(out).to.equal([
        { instance: { name: '1'}, config: { instance: { name: '1'}, contextId: null}},
        { instance: { name: '2'}, config: undefined}
      ])
      done()
    })
  }) // end _addConfigToInstances

  describe('_addMissingConfigs', () => {
    it('should add missing configs to array', (done) => {
      const out = ClusterConfigService._addMissingConfigs(
        [{instance: {name: '1'}}, {instance: {name: '4'}}],
        [{instance: {name: '1'}}, {instance: {name: '2'}}]
      )
      expect(out).to.equal([{instance: {name: '1'}}, {instance: {name: '2'}}, {config: {instance: {name: '4'}}}])
      done()
    })
  }) // end _addMissingConfigs

  describe('_isConfigMissingInstance', () => {
    it('should return false if config has an instance', (done) => {
      const out = ClusterConfigService._isConfigMissingInstance(
        [{instance: {name: '1'}}, {instance: {name: '2'}}, {instance: {name: '3'}}],
        {instance: {name: '1'}}
      )

      expect(out).to.be.false()
      done()
    })

    it('should return true if config does not have an instance', (done) => {
      const out = ClusterConfigService._isConfigMissingInstance(
        [{instance: {name: '1'}}, {instance: {name: '2'}}, {instance: {name: '3'}}],
        {instance: {name: '5'}}
      )

      expect(out).to.be.true()
      done()
    })
  }) // end _isConfigMissingInstance

  describe('fetchConfigByInstanceId', function () {
    const autoIsolationConfigId = objectId('107f191e810c19729de860ee')
    const clusterConfigId = objectId('407f191e810c19729de860ef')
    const parentInstanceId = objectId('507f191e810c19729de860ea')
    const depInstanceId1 = objectId('607f191e810c19729de860eb')
    const filePath = 'config/compose.yml'
    const composeConfigData = {
      _id: clusterConfigId,
      autoIsolationConfigId: autoIsolationConfigId,
      filePath: filePath
    }

    const autoIsolationConfigData = {
      _id: autoIsolationConfigId,
      instance: parentInstanceId,
      requestedDependencies: [
        {
          instance: depInstanceId1
        }
      ]
    }

    beforeEach(function (done) {
      sinon.stub(InputClusterConfig, 'findActiveByAutoIsolationId').resolves(new InputClusterConfig(composeConfigData))
      sinon.stub(AutoIsolationConfig, 'findActiveByInstanceId').resolves(new AutoIsolationConfig(autoIsolationConfigData))
      done()
    })
    afterEach(function (done) {
      InputClusterConfig.findActiveByAutoIsolationId.restore()
      AutoIsolationConfig.findActiveByInstanceId.restore()
      done()
    })
    describe('errors', function () {
      it('should return error if findActiveByAutoIsolationId failed', function (done) {
        const error = new Error('Some error')
        InputClusterConfig.findActiveByAutoIsolationId.rejects(error)
        ClusterConfigService.fetchConfigByInstanceId(parentInstanceId)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })

      it('should return error if findActiveByInstanceId failed', function (done) {
        const error = new Error('Some error')
        AutoIsolationConfig.findActiveByInstanceId.rejects(error)
        ClusterConfigService.fetchConfigByInstanceId(parentInstanceId)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })
    })

    describe('success', function () {
      it('should run successfully', function (done) {
        ClusterConfigService.fetchConfigByInstanceId(parentInstanceId).asCallback(done)
      })

      it('should call InputClusterConfig.findActiveByAutoIsolationId with isolation id from the instance', function (done) {
        ClusterConfigService.fetchConfigByInstanceId(parentInstanceId)
          .tap(function () {
            sinon.assert.calledOnce(InputClusterConfig.findActiveByAutoIsolationId)
            sinon.assert.calledWithExactly(
              InputClusterConfig.findActiveByAutoIsolationId,
              autoIsolationConfigId
            )
          })
          .asCallback(done)
      })
    })
  })

  describe('fetchFileFromGithub', function () {
    const filePath = 'config/compose.yml'
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
      _links: {
        self: 'https://api.github.com/repos/Runnable/compose-test-repo-1.2/contents/docker-compose.yml?ref=master',
        git: 'https://api.github.com/repos/Runnable/compose-test-repo-1.2/git/blobs/13ec49b1014891c7b494126226f95e318e1d3e82',
        html: 'https://github.com/Runnable/compose-test-repo-1.2/blob/master/docker-compose.yml'
      }
    }
    const fileString = 'version: \'2\'\nservices:\n  web:\n    build: \'./src/\'\n    command: [node, index.js]\n    ports:\n      - "5000:5000"\n    environment:\n      - NODE_ENV=development\n      - SHOW=true\n      - HELLO=678\n'
    const orgName = 'Runnable'
    const repoName = 'api'
    const repoFullName = orgName + '/' + repoName
    const commitRef = 'asdasdassdfgasdfwae'

    beforeEach(function (done) {
      sinon.stub(GitHub.prototype, 'getRepoContent').resolves(dockerComposeContent)
      sinon.stub(octobear, 'parse').resolves(testParsedContent)
      sinon.stub(ClusterConfigService, 'createFromRunnableConfig').resolves()
      done()
    })
    afterEach(function (done) {
      GitHub.prototype.getRepoContent.restore()
      octobear.parse.restore()
      ClusterConfigService.createFromRunnableConfig.restore()
      done()
    })
    describe('errors', function () {
      it('should return error if getRepoContent failed', function (done) {
        const error = new Error('Some error')
        GitHub.prototype.getRepoContent.rejects(error)
        ClusterConfigService.fetchFileFromGithub(testSessionUser, repoFullName, filePath, commitRef)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })
    })
    describe('success', function () {
      it('should run successfully', function (done) {
        ClusterConfigService.fetchFileFromGithub(testSessionUser, repoFullName, filePath, commitRef)
          .asCallback(done)
      })

      it('should call getRepoContent with correct args', function (done) {
        ClusterConfigService.fetchFileFromGithub(testSessionUser, repoFullName, filePath, commitRef)
          .tap(function () {
            sinon.assert.calledOnce(GitHub.prototype.getRepoContent)
            sinon.assert.calledWithExactly(GitHub.prototype.getRepoContent, repoFullName, filePath, commitRef)
          })
          .asCallback(done)
      })

      it('should resolve with correct args', function (done) {
        ClusterConfigService.fetchFileFromGithub(testSessionUser, repoFullName, filePath, commitRef)
          .tap(function (parsed) {
            expect(parsed).to.equal({
              fileString,
              fileSha: dockerComposeContent.sha,
              filePath,
              commitRef
            })
          })
          .asCallback(done)
      })
    })
  })
  describe('checkIfComposeFileHasChanged', function () {
    const filePath = 'config/compose.yml'
    const clusterConfig = {
      filePath: filePath,
      fileSha: '13ec49b1014891c7b494126226f95e318e1d3e82'
    }
    const changedClusterConfig = {
      filePath: filePath,
      fileSha: 'dfasdf3qaf3afa3wfa3faw3weas3asfa2eqdqd2q2'
    }
    const orgName = 'Runnable'
    const userId = 2
    const userModel = {}
    const instanceId = 'sadasdada233awad'
    const repoName = 'api'
    const repoFullName = orgName + '/' + repoName
    const githubPushInfo = {
      user: {
        id: userId
      },
      repo: repoFullName
    }

    beforeEach(function (done) {
      sinon.stub(ClusterConfigService, 'fetchConfigByInstanceId').resolves(clusterConfig)
      sinon.stub(UserService, 'getByGithubId').resolves(userModel)
      sinon.stub(ClusterConfigService, 'fetchFileFromGithub').resolves(changedClusterConfig)
      done()
    })
    afterEach(function (done) {
      ClusterConfigService.fetchConfigByInstanceId.restore()
      UserService.getByGithubId.restore()
      ClusterConfigService.fetchFileFromGithub.restore()
      done()
    })
    describe('errors', function () {
      it('should return error if fetchConfigByInstanceId failed', function (done) {
        const error = new Error('Some error')
        ClusterConfigService.fetchConfigByInstanceId.rejects(error)
        ClusterConfigService.checkIfComposeFileHasChanged(instanceId, githubPushInfo)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })
      it('should return error if UserService.getByGithubId failed', function (done) {
        const error = new Error('Some error')
        UserService.getByGithubId.rejects(error)
        ClusterConfigService.checkIfComposeFileHasChanged(instanceId, githubPushInfo)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })
      it('should return error if ClusterConfigService.fetchFileFromGithub failed', function (done) {
        const error = new Error('Some error')
        ClusterConfigService.fetchFileFromGithub.rejects(error)
        ClusterConfigService.checkIfComposeFileHasChanged(instanceId, githubPushInfo)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })
    })
    describe('success', function () {
      it('should run successfully', function (done) {
        ClusterConfigService.fetchFileFromGithub.resolves(changedClusterConfig)
        ClusterConfigService.checkIfComposeFileHasChanged(instanceId, githubPushInfo)
          .asCallback(done)
      })
      it('should return InputClusterConfig.NotChangedError if shas match', function (done) {
        ClusterConfigService.fetchFileFromGithub.resolves(clusterConfig)
        ClusterConfigService.checkIfComposeFileHasChanged(instanceId, githubPushInfo)
          .then(function () {
            done(new Error('Expecting NotChangedError'))
          })
          .catch(InputClusterConfig.NotChangedError, function () {
            done()
          })
      })
    })
  })
  describe('_createAutoIsolationModelsFromClusterInstances', function () {
    const mainInstanceId = objectId('407f191e810c19729de860ef')
    const depInstanceId = objectId('407f191e810c19729de860f0')
    const depRepoInstanceId = objectId('407f191e810c19729de860ff')
    const mainInstance = {
      _id: mainInstanceId,
      name: 'api'
    }
    const mainInstanceObj = {
      config: {
        metadata: {
          isMain: true
        }
      },
      instance: mainInstance
    }
    const depRepoInstance = {
      _id: depRepoInstanceId,
      name: 'navi'
    }
    const depRepoInstanceObj = {
      config: {
        metadata: {
          isMain: false
        }
      },
      instance: depRepoInstance
    }
    const depInstance = {
      _id: depInstanceId,
      name: 'mongo'
    }
    const depInstanceObj = {
      config: {
        metadata: {
          isMain: false
        },
        files: {}
      },
      instance: depInstance
    }
    let instances
    beforeEach(function (done) {
      instances = []
      done()
    })
    describe('success', function () {
      it('should run successfully', function (done) {
        instances = [mainInstanceObj, depInstanceObj]
        ClusterConfigService._createAutoIsolationModelsFromClusterInstances(instances)
        done()
      })
      it('should return main instance and dep', function (done) {
        instances = [mainInstanceObj, depInstanceObj]
        const model = ClusterConfigService._createAutoIsolationModelsFromClusterInstances(instances)
        expect(model).to.exist()
        expect(model.instance).to.equal(mainInstanceId)
        expect(model.requestedDependencies.length).to.equal(1)
        expect(model.requestedDependencies[0].instance).to.equal(depInstanceId)
        expect(model.requestedDependencies[0].matchBranch).to.be.undefined()
        done()
      })
      it('should return main instance and matched-branched dep', function (done) {
        instances = [mainInstanceObj, depRepoInstanceObj]
        const model = ClusterConfigService._createAutoIsolationModelsFromClusterInstances(instances)
        expect(model).to.exist()
        expect(model.instance).to.equal(mainInstanceId)
        expect(model.requestedDependencies.length).to.equal(1)
        expect(model.requestedDependencies[0].instance).to.equal(depRepoInstanceId)
        expect(model.requestedDependencies[0].matchBranch).to.be.undefined()
        done()
      })
      it('should return main instance and both deps', function (done) {
        instances = [mainInstanceObj, depRepoInstanceObj, depInstanceObj]
        const model = ClusterConfigService._createAutoIsolationModelsFromClusterInstances(instances)
        expect(model).to.exist()
        expect(model.instance).to.equal(mainInstanceId)
        expect(model.requestedDependencies.length).to.equal(2)
        expect(model.requestedDependencies[0].instance).to.equal(depRepoInstanceId)
        expect(model.requestedDependencies[0].matchBranch).to.be.undefined()
        expect(model.requestedDependencies[1].instance).to.equal(depInstanceId)
        expect(model.requestedDependencies[1].matchBranch).to.be.undefined()
        done()
      })
    })
  })
  describe('_createUpdateAndDeleteInstancesForClusterUpdate', function () {
    testSessionUser = {
      _id: 'id',
      accounts: {
        github: {
          id: testUserGithubId,
          accessToken: 'some-token'
        },
        login: 'login',
        username: 'best'
      },
      bigPoppaUser: {
        id: testUserBpId,
        organizations: [{
          name: testOrgName,
          lowerName: testOrgName.toLowerCase(),
          id: testOrgBpId,
          githubId: testOrgGithubId
        }]
      }
    }
    const orgName = 'Runnable'
    const repoName = 'api'
    const repoFullName = orgName + '/' + repoName
    const githubPushInfo = {
      repo: repoFullName
    }
    const mainInstanceId = objectId('407f191e810c19729de860ef')
    const updateInstanceId = objectId('407f191e810c19729de860f1')
    const deleteInstanceId = objectId('407f191e810c19729de860f2')
    const createInstanceId = objectId('407f191e810c19729de860f3')
    const mainInstance = {
      isTesting: true,
      _id: mainInstanceId,
      name: 'api'
    }
    const updateInstance = {
      _id: updateInstanceId,
      name: 'api'
    }
    const updateInstanceObj = {
      config: {
        instance: {}
      },
      instance: updateInstance
    }
    const deleteInstance = {
      _id: deleteInstanceId,
      name: 'navi'
    }
    const deleteInstanceObj = {
      instance: deleteInstance
    }
    const createInstance = {
      _id: createInstanceId,
      name: 'web'
    }
    const createInstanceConfig = {
      instance: {},
      files: {}
    }
    const preCreateInstanceObj = {
      config: createInstanceConfig
    }
    const postCreateInstanceObj = {
      config: createInstanceConfig,
      instance: createInstance
    }
    let instances
    beforeEach(function (done) {
      instances = []
      done()
    })
    beforeEach(function (done) {
      sinon.stub(ClusterConfigService, 'addAliasesToContexts').returns()
      sinon.stub(ClusterConfigService, 'createClusterContext').resolves(createInstanceConfig)
      sinon.stub(ClusterConfigService, '_updateInstancesWithConfigs').resolves(updateInstanceObj)
      sinon.stub(ClusterConfigService, '_createNewInstancesForNewConfigs').resolves(postCreateInstanceObj)
      sinon.stub(rabbitMQ, 'deleteInstance').returns()
      done()
    })
    afterEach(function (done) {
      ClusterConfigService.addAliasesToContexts.restore()
      ClusterConfigService.createClusterContext.restore()
      ClusterConfigService._updateInstancesWithConfigs.restore()
      ClusterConfigService._createNewInstancesForNewConfigs.restore()
      rabbitMQ.deleteInstance.restore()
      done()
    })
    describe('success', function () {
      beforeEach(function (done) {
        instances = [updateInstanceObj, deleteInstanceObj, preCreateInstanceObj]
        done()
      })
      it('should run successfully', function (done) {
        ClusterConfigService._createUpdateAndDeleteInstancesForClusterUpdate(
          testSessionUser,
          instances,
          mainInstance,
          githubPushInfo
        )
          .asCallback(done)
      })
      it('should resolve with an array with 2 instances in it', function (done) {
        ClusterConfigService._createUpdateAndDeleteInstancesForClusterUpdate(
          testSessionUser,
          instances,
          mainInstance,
          githubPushInfo
          )
          .then(instances => {
            expect(instances.length).to.equal(2)
            expect(instances).to.contains(updateInstanceObj)
            expect(instances).to.contains(postCreateInstanceObj)
          })
          .asCallback(done)
      })
      it('should call createInstance before update', function (done) {
        ClusterConfigService._createUpdateAndDeleteInstancesForClusterUpdate(
          testSessionUser,
          instances,
          mainInstance,
          githubPushInfo
          )
          .then(instances => {
            sinon.assert.callOrder(
              ClusterConfigService.createClusterContext,
              ClusterConfigService.addAliasesToContexts,
              ClusterConfigService._createNewInstancesForNewConfigs,
              ClusterConfigService._updateInstancesWithConfigs
            )
          })
          .asCallback(done)
      })
      it('should have called update with updateInstance', function (done) {
        ClusterConfigService._createUpdateAndDeleteInstancesForClusterUpdate(
          testSessionUser,
          instances,
          mainInstance,
          githubPushInfo
          )
          .then(() => {
            sinon.assert.calledOnce(ClusterConfigService._updateInstancesWithConfigs)
            sinon.assert.calledWithExactly(ClusterConfigService._updateInstancesWithConfigs, testSessionUser, updateInstanceObj)
          })
          .asCallback(done)
      })
      it('should have called create with createInstance', function (done) {
        ClusterConfigService._createUpdateAndDeleteInstancesForClusterUpdate(
          testSessionUser,
          instances,
          mainInstance,
          githubPushInfo
        )
          .then(() => {
            sinon.assert.calledOnce(ClusterConfigService._createNewInstancesForNewConfigs)
            sinon.assert.calledWithExactly(
              ClusterConfigService._createNewInstancesForNewConfigs,
              testSessionUser,
              preCreateInstanceObj.config,
              githubPushInfo.repo,
              mainInstance.isTesting,
              'autoDeploy'
            )
          })
          .asCallback(done)
      })
      it('should have given addAliasesToContexts the update and created configs ', function (done) {
        ClusterConfigService._createUpdateAndDeleteInstancesForClusterUpdate(
          testSessionUser,
          instances,
          mainInstance,
          githubPushInfo
        )
          .then(() => {
            sinon.assert.calledOnce(ClusterConfigService.addAliasesToContexts)
            sinon.assert.calledWith(ClusterConfigService.addAliasesToContexts, [
              preCreateInstanceObj.config,
              updateInstanceObj.config
            ])
          })
          .asCallback(done)
      })
      it('should have called delete with deleteInstance', function (done) {
        ClusterConfigService._createUpdateAndDeleteInstancesForClusterUpdate(
          testSessionUser,
          instances,
          mainInstance,
          githubPushInfo
        )
          .then(() => {
            sinon.assert.calledOnce(rabbitMQ.deleteInstance)
            sinon.assert.calledWithExactly(rabbitMQ.deleteInstance, {
              instanceId: deleteInstanceId.toString()
            })
          })
          .asCallback(done)
      })
    })
  })
  describe('updateCluster', function () {
    const orgName = 'Runnable'
    const repoName = 'api'
    const repoFullName = orgName + '/' + repoName
    const githubPushInfo = {
      repo: repoFullName
    }
    testSessionUser = {
      _id: 'id',
      accounts: {
        github: {
          id: testUserGithubId,
          accessToken: 'some-token'
        },
        login: 'login',
        username: 'best'
      },
      bigPoppaUser: {
        id: testUserBpId,
        organizations: [{
          name: testOrgName,
          lowerName: testOrgName.toLowerCase(),
          id: testOrgBpId,
          githubId: testOrgGithubId
        }]
      }
    }
    const mainInstanceId = objectId('407f191e810c19729de860ef')
    const depInstanceId = objectId('407f191e810c19729de860f0')
    const depRepoInstanceId = objectId('407f191e810c19729de860ff')
    const mainInstance = {
      _id: mainInstanceId,
      name: 'api'
    }
    const mainInstanceObj = {
      config: {
        metadata: {
          isMain: true
        }
      },
      instance: mainInstance
    }
    const depRepoInstance = {
      _id: depRepoInstanceId,
      name: 'navi'
    }
    const depRepoInstanceObj = {
      config: {
        metadata: {
          isMain: false
        }
      },
      instance: depRepoInstance
    }
    const depInstance = {
      _id: depInstanceId,
      name: 'mongo'
    }
    const depInstanceObj = {
      config: {
        metadata: {
          isMain: false
        },
        files: {}
      },
      instance: depInstance
    }
    const autoIsolationModel = {
      instance: mainInstanceId,
      requestedDependencies: [depInstance, depRepoInstance]
    }
    const instanceObjs = [mainInstanceObj, depInstanceObj, depRepoInstanceObj]
    const octobearInfo = {}
    let instances
    beforeEach(function (done) {
      sinon.stub(AutoIsolationService, 'fetchAutoIsolationDependentInstances').resolves([depInstance, depRepoInstance])
      sinon.stub(ClusterConfigService, '_mergeConfigsIntoInstances').resolves(instanceObjs)
      sinon.stub(ClusterConfigService, '_createUpdateAndDeleteInstancesForClusterUpdate').resolves(instanceObjs)
      sinon.stub(ClusterConfigService, '_createAutoIsolationModelsFromClusterInstances').resolves(autoIsolationModel)
      sinon.stub(AutoIsolationConfig, 'updateAutoIsolationDependencies').resolves()
      sinon.stub(rabbitMQ, 'autoDeployInstance').resolves()
      done()
    })
    afterEach(function (done) {
      AutoIsolationService.fetchAutoIsolationDependentInstances.restore()
      ClusterConfigService._mergeConfigsIntoInstances.restore()
      ClusterConfigService._createUpdateAndDeleteInstancesForClusterUpdate.restore()
      ClusterConfigService._createAutoIsolationModelsFromClusterInstances.restore()
      AutoIsolationConfig.updateAutoIsolationDependencies.restore()
      rabbitMQ.autoDeployInstance.restore()
      done()
    })
    describe('success', function () {
      it('should run successfully', function (done) {
        ClusterConfigService.updateCluster(testSessionUser, mainInstance, githubPushInfo, octobearInfo)
          .asCallback(done)
      })
      it('should call all the methods in order', function (done) {
        ClusterConfigService.updateCluster(testSessionUser, mainInstance, githubPushInfo, octobearInfo)
          .then(() => {
            sinon.assert.callOrder(
              AutoIsolationService.fetchAutoIsolationDependentInstances,
              ClusterConfigService._mergeConfigsIntoInstances,
              ClusterConfigService._createUpdateAndDeleteInstancesForClusterUpdate,
              ClusterConfigService._createAutoIsolationModelsFromClusterInstances,
              AutoIsolationConfig.updateAutoIsolationDependencies
            )
          })
          .asCallback(done)
      })
      it('should call fetchAutoIsolationDependentInstances with the mainInstanceId', function (done) {
        ClusterConfigService.updateCluster(testSessionUser, mainInstance, githubPushInfo, octobearInfo)
          .then(() => {
            sinon.assert.calledOnce(AutoIsolationService.fetchAutoIsolationDependentInstances)
            sinon.assert.calledWith(AutoIsolationService.fetchAutoIsolationDependentInstances, mainInstanceId)
          })
          .asCallback(done)
      })
      it('should call _mergeConfigsIntoInstances with all three instances (including main)', function (done) {
        ClusterConfigService.updateCluster(testSessionUser, mainInstance, githubPushInfo, octobearInfo)
          .then(() => {
            sinon.assert.calledOnce(ClusterConfigService._mergeConfigsIntoInstances)
            sinon.assert.calledWith(ClusterConfigService._mergeConfigsIntoInstances, octobearInfo)
            expect(ClusterConfigService._mergeConfigsIntoInstances.getCall(0).args[1]).to.contains(mainInstance, depInstance, depRepoInstance)
          })
          .asCallback(done)
      })
      it('should call _createUpdateAndDeleteInstancesForClusterUpdate with the right inputs', function (done) {
        ClusterConfigService.updateCluster(testSessionUser, mainInstance, githubPushInfo, octobearInfo)
          .then(() => {
            sinon.assert.calledOnce(ClusterConfigService._createUpdateAndDeleteInstancesForClusterUpdate)
            sinon.assert.calledWith(
              ClusterConfigService._createUpdateAndDeleteInstancesForClusterUpdate,
              testSessionUser,
              instanceObjs,
              mainInstance,
              githubPushInfo)
          })
          .asCallback(done)
      })
      it('should call _createAutoIsolationModelsFromClusterInstances with the right inputs', function (done) {
        ClusterConfigService.updateCluster(testSessionUser, mainInstance, githubPushInfo, octobearInfo)
          .then(() => {
            sinon.assert.calledOnce(ClusterConfigService._createAutoIsolationModelsFromClusterInstances)
            sinon.assert.calledWith(
              ClusterConfigService._createAutoIsolationModelsFromClusterInstances,
              instanceObjs) // This is the output of the stub before it
          })
          .asCallback(done)
      })
      it('should call _createAutoIsolationModelsFromClusterInstances with the right inputs', function (done) {
        ClusterConfigService.updateCluster(testSessionUser, mainInstance, githubPushInfo, octobearInfo)
          .then(() => {
            sinon.assert.calledOnce(AutoIsolationConfig.updateAutoIsolationDependencies)
            sinon.assert.calledWith(
              AutoIsolationConfig.updateAutoIsolationDependencies,
              autoIsolationModel.instance,
              autoIsolationModel.requestedDependencies)
          })
          .asCallback(done)
      })
      it('should call autoDeployInstance with the right inputs', function (done) {
        ClusterConfigService.updateCluster(testSessionUser, mainInstance, githubPushInfo, octobearInfo)
          .then(() => {
            sinon.assert.calledOnce(rabbitMQ.autoDeployInstance)
            sinon.assert.calledWith(
              rabbitMQ.autoDeployInstance, {
                instanceId: mainInstance._id.toString(),
                pushInfo: githubPushInfo
              })
          })
          .asCallback(done)
      })
    })
  })

  describe('parseComposeFileAndPopulateENVs', () => {
    const mainInstanceName = 'mainInstanceName'
    const bigPoppaUser = {}
    const repoFullName = 'Runnable/octobear'
    const composeFileData = {
      commitRef: 'asdasdasdasdsa'
    }
    const fileString = 'ENV1=hello'
   const envFiles = ['./env', './docker/.env', './wow/.env']
    let parseResult
    beforeEach(done => {
      parseResult = {
        results: [{
          metadata: {
            name: 'wow',
            envFiles: []
          },
          instance: {
            env: []
          }
        }],
        envFiles
      }
      sinon.spy(octobear, 'populateENVsFromFiles')
      sinon.stub(ClusterConfigService, 'parseComposeFile').resolves(parseResult)
      sinon.stub(ClusterConfigService, 'fetchFileFromGithub').resolves({ fileString })
      done()
    })
    afterEach(done => {
      octobear.populateENVsFromFiles.restore()
      ClusterConfigService.parseComposeFile.restore()
      ClusterConfigService.fetchFileFromGithub.restore()
      done()
    })

    it('should call `parse`', () => {
      return ClusterConfigService.parseComposeFileAndPopulateENVs(composeFileData, repoFullName, mainInstanceName, bigPoppaUser)
        .then(result => {
          sinon.assert.calledOnce(ClusterConfigService.parseComposeFile)
          sinon.assert.calledWithExactly(
            ClusterConfigService.parseComposeFile,
            composeFileData,
            repoFullName,
            mainInstanceName
          )
        })
    })

    it('should not fetch any files if `envFiles` is empty', () => {
      parseResult.envFiles = []
      return ClusterConfigService.parseComposeFileAndPopulateENVs(composeFileData, repoFullName, mainInstanceName, bigPoppaUser)
        .then(result => {
          sinon.assert.notCalled(ClusterConfigService.fetchFileFromGithub)
        })
    })

    it('should fetch all files in `envFiles`', () => {
      return ClusterConfigService.parseComposeFileAndPopulateENVs(composeFileData, repoFullName, mainInstanceName, bigPoppaUser)
        .then(result => {
          sinon.assert.called(ClusterConfigService.fetchFileFromGithub)
          sinon.assert.callCount(ClusterConfigService.fetchFileFromGithub, envFiles.length)
          sinon.assert.calledWithExactly(
            ClusterConfigService.fetchFileFromGithub,
            bigPoppaUser,
            repoFullName,
            envFiles[0],
            composeFileData.commitRef
          )
          sinon.assert.calledWithExactly(
            ClusterConfigService.fetchFileFromGithub,
            bigPoppaUser,
            repoFullName,
            envFiles[1],
            composeFileData.commitRef
          )
          sinon.assert.calledWithExactly(
            ClusterConfigService.fetchFileFromGithub,
            bigPoppaUser,
            repoFullName,
            envFiles[2],
            composeFileData.commitRef
          )
        })
    })

    it('should call `populateENVsFromFiles`', () => {
      return ClusterConfigService.parseComposeFileAndPopulateENVs(composeFileData, repoFullName, mainInstanceName, bigPoppaUser)
        .then(result => {
          sinon.assert.calledOnce(octobear.populateENVsFromFiles)
          sinon.assert.calledWithExactly(
            octobear.populateENVsFromFiles,
            parseResult.results,
            {
              './env': fileString,
              './docker/.env': fileString,
              './wow/.env': fileString
            }
          )
        })
    })

    it('should return an object with `.results`', () => {
      return ClusterConfigService.parseComposeFileAndPopulateENVs(composeFileData, repoFullName, mainInstanceName, bigPoppaUser)
        .then(res => {
          expect(res.results).to.be.an.array()
          expect(res.results).to.equal(parseResult.results)
        })
    })
  })
})
