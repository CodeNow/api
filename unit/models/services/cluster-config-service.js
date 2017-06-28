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
  const clusterCreateId = 'bruce leroy'
  let testOrgInfo

  let testMainParsedContent
  let testDepParsedContent
  let testParsedContent
  let testSessionUser
  const testOrg = {
    id: testOrgBpId
  }
  const ownerInfo = {
    bigPoppaOrgId: testOrgBpId,
    bigPoppaUserId: testUserBpId,
    githubOrgId: testOrgGithubId,
    githubUserId: testUserGithubId
  }
  const getInstanceMock = (name) => {
    return {
      instance: {
        name,
        shortName: name,
        getMainBranchName: sinon.stub().returns('a1')
      }
    }
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
      build: {
        dockerFilePath: 'Dockerfile',
        dockerBuildContext: '.'
      },
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
      build: {
        dockerFilePath: 'Dockerfile',
        dockerBuildContext: '.'
      },
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
      envFiles: [],
      files: [{
        path: '/docker-compose.extended.yml',
        sha: '5de165f117827881f929b5456ad4081e0445885e',
        _id:  '5930e9d37d9b580e009ce4d2'
      }],
      mains: {
        builds: { 'api': {} },
        externals: {}
      }
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
      _links: {
        self: 'https://api.github.com/repos/Runnable/compose-test-repo-1.2/contents/docker-compose.yml?ref=master',
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
      sha: dockerComposeContent.sha,
      fileString: fileString
    }
    const commitSha = 'abcc0b9'
    const branchMock = {
      commit: {
        sha: commitSha
      }
    }

    const testData = {
      triggeredAction, repoFullName, branchName, filePath, isTesting, testReporters, clusterName, clusterCreateId, parentInputClusterConfigId
    }

    beforeEach(function (done) {
      sinon.stub(GitHub.prototype, 'getBranchAsync').resolves(branchMock)
      sinon.stub(ClusterConfigService, 'parseComposeFileAndPopulateENVs').resolves(testParsedContent)
      sinon.stub(ClusterConfigService, 'createFromRunnableConfig').resolves()
      sinon.stub(ClusterConfigService, '_getMainKeyFromOctobearMains').returns('api')
      done()
    })
    afterEach(function (done) {
      GitHub.prototype.getBranchAsync.restore()
      ClusterConfigService.parseComposeFileAndPopulateENVs.restore()
      ClusterConfigService.createFromRunnableConfig.restore()
      ClusterConfigService._getMainKeyFromOctobearMains.restore()
      done()
    })
    describe('errors', function () {
      it('should return error if ClusterConfigService.parseComposeFileAndPopulateENVs failed', function (done) {
        const error = new Error('Some error')
        ClusterConfigService.parseComposeFileAndPopulateENVs.throws(error)
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
      it('should run successfully', function () {
        return ClusterConfigService.create(testSessionUser, testData)
      })

      it('should call ClusterConfigService.parseComposeFileAndPopulateENVs with correct args', function () {
        return ClusterConfigService.create(testSessionUser, testData)
          .tap(function () {
            sinon.assert.calledOnce(ClusterConfigService.parseComposeFileAndPopulateENVs)
          })
      })

      it('should call ClusterConfigService.createFromRunnableConfig with correct args', function () {
        return ClusterConfigService.create(testSessionUser, testData)
          .tap(function () {
            sinon.assert.calledOnce(ClusterConfigService.createFromRunnableConfig)
            const args = ClusterConfigService.createFromRunnableConfig.getCall(0).args
            expect(args[0]).to.equal(testSessionUser)
            expect(args[1]).to.equal(testParsedContent.results)
            expect(args[2]).to.equal( { triggeredAction, clusterCreateId, repoFullName, mainInstanceServiceName: 'api'  })
            expect(args[3]).to.equal({
              branch: branchName,
              commit: commitSha,
              repo: repoFullName,
              clusterName,
              files: testParsedContent.files,
              isTesting,
              testReporters,
              parentInputClusterConfigId
            })
            expect(args[4]).to.equal('api')
            sinon.assert.calledWithExactly(
              ClusterConfigService.createFromRunnableConfig,
              testSessionUser,
              testParsedContent.results,
              { triggeredAction, clusterCreateId, repoFullName, mainInstanceServiceName: 'api' },
              sinon.match({
                branch: branchName,
                commit: commitSha,
                repo: repoFullName,
                clusterName,
                files: testParsedContent.files,
                isTesting,
                testReporters,
                parentInputClusterConfigId
              }),
              'api'
            )
          })
      })

      it('should call all the functions in the order', function () {
        return ClusterConfigService.create(testSessionUser, testData)
          .tap(function () {
            sinon.assert.callOrder(
              ClusterConfigService.parseComposeFileAndPopulateENVs,
              ClusterConfigService.createFromRunnableConfig)
          })
      })
    })
  })

  describe('createFromRunnableConfig', function () {
    const autoIsolationConfigId = objectId('107f191e810c19729de860ee')
    const clusterConfigId = objectId('407f191e810c19729de860ef')
    const parentInstanceId = objectId('507f191e810c19729de860ea')
    const depInstanceId1 = objectId('607f191e810c19729de860eb')
    const filePath = 'config/compose.yml'
    const isTesting = false
    const fileSha = 'asdfasdfadsfase3kj3lkj4qwdfalk3fawhsdfkjsd'
    const mainInstanceServiceName = 'api'
    const composeData = {
      repositoryName: 'sdasdasd',
      files: [
        {
          sha: fileSha
        }
      ]
    }
    let mainWithConfig
    let depWithConfig
    const clusterOpts = {
      clusterName: composeData.repositoryName,
      isTesting,
      testReporters: [],
      files: [
        {
          path: filePath,
          sha: fileSha
        }
      ]
    }
    const buildOpts = {
      repoFullName: composeData.repositoryName,
      triggeredAction: 'autoDeploy'
    }
    const mainInstance = {}
    beforeEach(function (done) {
      mainWithConfig = { config: testMainParsedContent , instance: {} }
      depWithConfig = { config: testDepParsedContent , instance: {} }
      const instanceCreate = sinon.stub(ClusterConfigService, '_createNewInstanceForNewConfig')
      instanceCreate.onCall(0).resolves(mainWithConfig)
      instanceCreate.onCall(1).resolves(depWithConfig)
      sinon.stub(ClusterConfigService, '_getOwnerInfo').returns(ownerInfo)
      sinon.stub(ClusterConfigService, 'createClusterContext').resolves()
      sinon.stub(ClusterConfigService, 'addAliasesToContexts').resolves()
      sinon.stub(ClusterConfigService, 'createIsolationConfig').resolves()
      sinon.stub(ClusterConfigService, '_getInstanceFromServicesByShortName').returns(mainInstance)
      done()
    })
    afterEach(function (done) {
      ClusterConfigService._getOwnerInfo.restore()
      ClusterConfigService.createClusterContext.restore()
      ClusterConfigService._createNewInstanceForNewConfig.restore()
      ClusterConfigService.addAliasesToContexts.restore()
      ClusterConfigService.createIsolationConfig.restore()
      ClusterConfigService._getInstanceFromServicesByShortName.restore()
      done()
    })
    describe('errors', function () {
      it('should return error if _createNewInstanceForNewConfig failed', function (done) {
        const error = new Error('Some error')
        ClusterConfigService._createNewInstanceForNewConfig.onCall(0).rejects(error)
        ClusterConfigService._createNewInstanceForNewConfig.onCall(1).rejects(error)
        ClusterConfigService.createFromRunnableConfig(testSessionUser, testParsedContent.results, buildOpts, clusterOpts, mainInstanceServiceName)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })

      it('should return error if createClusterContext failed', function (done) {
        const error = new Error('Some error')
        ClusterConfigService.createClusterContext.rejects(error)
        ClusterConfigService.createFromRunnableConfig(testSessionUser, testParsedContent.results, buildOpts, clusterOpts, mainInstanceServiceName)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })

      it('should return error if updateIsolationConfig failed', function (done) {
        const error = new Error('Some error')
        ClusterConfigService.createIsolationConfig.rejects(error)
        ClusterConfigService.createFromRunnableConfig(testSessionUser, testParsedContent.results, buildOpts, clusterOpts, mainInstanceServiceName)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })
    })
    describe('success', function () {
      it('should run successfully', function () {
        return ClusterConfigService.createFromRunnableConfig(testSessionUser, testParsedContent.results, buildOpts, clusterOpts, mainInstanceServiceName)
      })
      it('should call ClusterConfigService.createClusterContext with correct args', function (done) {
        ClusterConfigService.createFromRunnableConfig(testSessionUser, testParsedContent.results, buildOpts, clusterOpts, mainInstanceServiceName)
          .tap(function () {
            sinon.assert.calledTwice(ClusterConfigService.createClusterContext)
            sinon.assert.calledWithExactly(ClusterConfigService.createClusterContext,
              testSessionUser,
              testParsedContent.results[0],
              sinon.match({
                githubOrgId: testOrgGithubId,
                bigPoppaOrgId: testOrgBpId
              }))
            sinon.assert.calledWithExactly(ClusterConfigService.createClusterContext,
              testSessionUser,
              testParsedContent.results[1],
              sinon.match({
                githubOrgId: testOrgGithubId,
                bigPoppaOrgId: testOrgBpId
              }))
          })
          .asCallback(done)
      })
      it('should call ClusterConfigService.addAliasesToContexts with correct args', function (done) {
        ClusterConfigService.createFromRunnableConfig(testSessionUser, testParsedContent.results, buildOpts, clusterOpts, mainInstanceServiceName)
          .tap(function () {
            sinon.assert.calledOnce(ClusterConfigService.addAliasesToContexts)
            sinon.assert.calledWithExactly(ClusterConfigService.addAliasesToContexts,
              testParsedContent.results
            )
          })
          .asCallback(done)
      })

      it('should call _createNewInstanceForNewConfig with correct args', () => {
        return ClusterConfigService.createFromRunnableConfig(testSessionUser, testParsedContent.results, buildOpts, clusterOpts, mainInstanceServiceName)
          .tap(function () {
            sinon.assert.calledTwice(ClusterConfigService._createNewInstanceForNewConfig)
            sinon.assert.calledWithExactly(ClusterConfigService._createNewInstanceForNewConfig,
              testSessionUser,
              testParsedContent.results[0],
              clusterOpts,
              buildOpts,
              ownerInfo
            )
            sinon.assert.calledWithExactly(ClusterConfigService._createNewInstanceForNewConfig,
              testSessionUser,
              testParsedContent.results[1],
              clusterOpts,
              buildOpts,
              ownerInfo
            )
          })
      })

      it('should call updateIsolationConfig correct args', () => {
        return ClusterConfigService.createFromRunnableConfig(testSessionUser, testParsedContent.results, buildOpts, clusterOpts, mainInstanceServiceName)
          .tap(function () {
            sinon.assert.calledOnce(ClusterConfigService.createIsolationConfig)
            sinon.assert.calledWithExactly(
              ClusterConfigService.createIsolationConfig,
              ownerInfo,
              [mainWithConfig, depWithConfig],
              clusterOpts,
              mainInstance
            )
          })
      })
      it('should call all the functions in the order', () => {
        return ClusterConfigService.createFromRunnableConfig(testSessionUser, testParsedContent.results, buildOpts, clusterOpts, mainInstanceServiceName)
          .tap(function () {
            sinon.assert.callOrder(
              ClusterConfigService._getOwnerInfo,
              ClusterConfigService.createClusterContext,
              ClusterConfigService.addAliasesToContexts,
              ClusterConfigService._createNewInstanceForNewConfig,
              ClusterConfigService.createIsolationConfig
            )
          })
      })
    })
  })

  describe('_addBranchName', () => {
    let instanceDef
    let clusterOpts
    const branchName = 'hello'
    beforeEach(done => {
      instanceDef = {
        metadata: {},
        build: {},
        code: {
          repo: 'repository-name'
        }
      }
      clusterOpts = {
        branch: branchName
      }
      done()
    })

    it('should not add the branch name if there is none', done => {
      delete clusterOpts.branch
      ClusterConfigService._addBranchName(instanceDef, clusterOpts)
      expect(instanceDef.metadata.branch).to.be.undefined()
      done()
    })

    it('should not add the branch name if it\'s a github repo', done => {
      ClusterConfigService._addBranchName(instanceDef, clusterOpts)
      expect(instanceDef.metadata.branch).to.be.undefined()
      done()
    })

    it('should add the branch name if build is present and not a repo', done => {
      instanceDef.code = {} // Code is always an object. No key/values when there is no repo
      ClusterConfigService._addBranchName(instanceDef, clusterOpts)
      expect(instanceDef.metadata.branch).to.equal(branchName)
      done()
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
    const testRepoName = 'Runnable/boo'
    const testingOpts = {
      isTesting, isTestReporter
    }
    const testTriggeredAction = 'user'
    const buildOpts = {
      repoFullName: testRepoName,
      isTestReporter,
      triggeredAction: testTriggeredAction
    }
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

    it('should create cluster instance', () => {
      const testInstance = { _id: 'instance' }
      const testBuild = { _id: objectId('407f191e810c19729de860ef') }
      const testContext = { _id: 'context' }
      const testContextVersion = { _id: 'contextVersion' }

      ClusterConfigService._createInstance.resolves(testInstance)
      ClusterConfigService._createBuild.resolves(testBuild)
      BuildService.buildBuild.resolves(testBuild)
      ClusterConfigService._createContextVersion.resolves(testContextVersion)
      testMainParsedContent.contextId = testContext._id

      return ClusterConfigService.createClusterInstance(
        testSessionUser,
        testMainParsedContent,
        testingOpts,
        buildOpts,
        ownerInfo
      )
        .then(instance => {
          expect(instance).to.equal(testInstance)
          sinon.assert.calledOnce(ClusterConfigService._createContextVersion)
          sinon.assert.calledWithExactly(ClusterConfigService._createContextVersion,
            testSessionUser,
            ownerInfo,
            buildOpts,
            testMainParsedContent
          )
          sinon.assert.calledOnce(ClusterConfigService._createBuild)
          sinon.assert.calledWithExactly(ClusterConfigService._createBuild,
            testSessionUser,
            testContextVersion._id,
            ownerInfo
          )
          sinon.assert.calledOnce(BuildService.buildBuild)
          const buildData = {
            message: 'Initial Cluster Creation',
            triggeredAction: {
              manual: true
            }
          }
          sinon.assert.calledWithExactly(BuildService.buildBuild, testBuild._id, buildData, testSessionUser)
          sinon.assert.calledOnce(ClusterConfigService._createInstance)
          sinon.assert.calledWithExactly(
            ClusterConfigService._createInstance,
            testSessionUser,
            testMainParsedContent,
            testBuild._id.toString(),
            testingOpts,
            buildOpts
          )
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
    const testRepoName = 'runnable/boo'
    let testContextVersion = { _id: 'contextVersion' }
    let testAppCodeVersion = { _id: 'testAppCodeVersion' }
    let testParentInfraCodeVersion = { _id: 'infraCodeVersion' }
    let testDockerfileContent
    const buildOpts = {
      repoFullName: testRepoName
    }
    let testParsedComposeData
    beforeEach((done) => {
      testParsedComposeData = {
        contextId: testContextId
      }
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
      it('should call ContextVersion.createWithNewInfraCode if no Dockerfile was provided', () => {
        const testDockerfilePath = '/Dockerfile'
        const testBuildDockerContext = '.'
        testParsedComposeData.build = {
          dockerFilePath: testDockerfilePath,
          dockerBuildContext: testBuildDockerContext
        }
        return ClusterConfigService._createContextVersion(testSessionUser, ownerInfo, buildOpts, testParsedComposeData)
          .tap((contextVersion) => {
            expect(contextVersion).to.equal(testContextVersion)
            sinon.assert.calledOnce(ContextVersion.createAppcodeVersion)
            sinon.assert.calledWithExactly(ContextVersion.createAppcodeVersion, testSessionUser, testRepoName, null)
            sinon.assert.calledOnce(InfraCodeVersionService.findBlankInfraCodeVersion)
            sinon.assert.calledWithExactly(InfraCodeVersionService.findBlankInfraCodeVersion)
            sinon.assert.calledOnce(ContextVersion.createWithNewInfraCode)
            sinon.assert.calledWithExactly(
              ContextVersion.createWithNewInfraCode, {
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
                buildDockerContext: testBuildDockerContext,
                appCodeVersions: [testAppCodeVersion]
              }, {
                parent: testParentInfraCodeVersion._id,
                edited: true
              }
            )
          })
      })

      it('should call ContextVersion.createWithDockerFileContent if Dockefile was provided', () => {
        testParsedComposeData.contextVersion = {
          advanced: true
        }
        testParsedComposeData.files = {
          '/Dockerfile': {
            body: testDockerfileContent
          }
        }
        return ClusterConfigService._createContextVersion(testSessionUser, ownerInfo, buildOpts, testParsedComposeData)
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
          })
      })

      it('should call all functions in order if Dockerfile was not specified', () => {
        const testRepoName = 'runnable/boo'
        const testDockerfilePath = '/Dockerfile'
        const testBuildDockerContext = '.'
        const testParsedComposeData = {
          build: {
            dockerFilePath: testDockerfilePath,
            dockerBuildContext: testBuildDockerContext
          }
        }
        return ClusterConfigService._createContextVersion(testSessionUser, ownerInfo, buildOpts, testParsedComposeData)
          .tap((contextVersion) => {
            expect(contextVersion).to.equal(testContextVersion)
            sinon.assert.callOrder(
              InfraCodeVersionService.findBlankInfraCodeVersion,
              ContextVersion.createAppcodeVersion,
              ContextVersion.createWithNewInfraCode)
          })
      })

      it('should call all functions in order if Dockerfile was specified', () => {
        testParsedComposeData.contextVersion = {
          advanced: true
        }
        testParsedComposeData.files = {
          '/Dockerfile': {
            body: testDockerfileContent
          }
        }
        return ClusterConfigService._createContextVersion(testSessionUser, ownerInfo, buildOpts, testParsedComposeData)
          .tap((contextVersion) => {
            expect(contextVersion).to.equal(testContextVersion)
            sinon.assert.callOrder(
              InfraCodeVersionService.findBlankInfraCodeVersion,
              ContextVersion.createWithDockerFileContent)
          })
      })
      it('should call _createDockerfileContent after createAppcodeVersion if the metadata isMain is true', () => {
        testParsedComposeData.contextVersion = {
          advanced: true
        }
        testParsedComposeData.files = {
          '/Dockerfile': {
            body: testDockerfileContent
          }
        }
        testParsedComposeData.metadata = {
          isMain: true
        }
        return ClusterConfigService._createContextVersion(testSessionUser, ownerInfo, buildOpts, testParsedComposeData)
          .tap((contextVersion) => {
            expect(contextVersion).to.equal(testContextVersion)
            sinon.assert.callOrder(
              InfraCodeVersionService.findBlankInfraCodeVersion,
              ContextVersion.createAppcodeVersion,
              ClusterConfigService._createDockerfileContent)
          })
      })
      it('should call createAppcodeVersion with branch name if provided', () => {
        const testDockerfilePath = '/Dockerfile'
        const testBuildDockerContext = '.'
        const testParsedComposeData = {
          metadata: {
            isMain: true,
            branch: 'hello'
          },
          build: {
            dockerFilePath: testDockerfilePath,
            dockerBuildContext: testBuildDockerContext
          }
        }
        return ClusterConfigService._createContextVersion(testSessionUser, ownerInfo, buildOpts, testParsedComposeData)
          .tap((contextVersion) => {
            sinon.assert.calledOnce(ContextVersion.createAppcodeVersion)
            sinon.assert.calledWithExactly(ContextVersion.createAppcodeVersion, testSessionUser, testRepoName, 'hello')
          })
      })
      it('should not call before createAppcodeVersion if the config metadata isMain is false', () => {
        testParsedComposeData.contextVersion = {
          advanced: true
        }
        testParsedComposeData.files = {
          '/Dockerfile': {
            body: testDockerfileContent
          }
        }
        return ClusterConfigService._createContextVersion(testSessionUser, ownerInfo, buildOpts, testParsedComposeData)
          .tap((contextVersion) => {
            expect(contextVersion).to.equal(testContextVersion)
            sinon.assert.notCalled(ContextVersion.createAppcodeVersion)
          })
      })

      it('should call createAppcodeVersion with repo from `code` without a commit or branch', () => {
        const testDockerfilePath = '/Dockerfile'
        const testBuildDockerContext = '.'
        const testCodeRepoName = 'Runnable/octobear'
        const testParsedComposeData = {
          metadata: {
            isMain: false,
            branch: 'hello'
          },
          build: {
            dockerFilePath: testDockerfilePath,
            dockerBuildContext: testBuildDockerContext
          },
          code: {
            repo: testCodeRepoName
          }
        }
        return ClusterConfigService._createContextVersion(testSessionUser, ownerInfo, buildOpts, testParsedComposeData)
          .tap((contextVersion) => {
            sinon.assert.calledOnce(ContextVersion.createAppcodeVersion)
            sinon.assert.calledWithExactly(ContextVersion.createAppcodeVersion, testSessionUser, testCodeRepoName, null)
          })
      })

      it('should call createAppcodeVersion with repo and branch from `code`', () => {
        const testDockerfilePath = '/Dockerfile'
        const testBuildDockerContext = '.'
        const testCodeRepoName = 'Runnable/octobear'
        const testCodeRepoCommit = '7f3d086'
        const testParsedComposeData = {
          metadata: {
            isMain: false,
            branch: 'hello'
          },
          build: {
            dockerFilePath: testDockerfilePath,
            dockerBuildContext: testBuildDockerContext
          },
          code: {
            repo: testCodeRepoName,
            commitish: testCodeRepoCommit
          }
        }
        return ClusterConfigService._createContextVersion(testSessionUser, ownerInfo, buildOpts, testParsedComposeData)
          .tap((contextVersion) => {
            sinon.assert.calledOnce(ContextVersion.createAppcodeVersion)
            sinon.assert.calledWithExactly(ContextVersion.createAppcodeVersion, testSessionUser, testCodeRepoName, testCodeRepoCommit)
          })
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

    it('should create build', () => {
      const testContextVersionId = objectId('407f191e810c19729de860ef')
      const testBuildId = objectId('507f191e810c19729de860ee')
      const testBuild = {
        _id: testBuildId
      }
      BuildService.createBuild.resolves(testBuild)
      return ClusterConfigService._createBuild(testSessionUser, testContextVersionId, ownerInfo)
        .then(build => {
          sinon.assert.calledOnce(BuildService.createBuild)
          sinon.assert.calledWithExactly(BuildService.createBuild, {
            contextVersion: testContextVersionId,
            createdBy: {
              github: testUserGithubId
            },
            owner: {
              github: testOrgGithubId
            }
          }, testSessionUser)

          expect(build).to.equal(testBuild)
        })
    })
  }) // end _createBuild

  describe('_createInstance', () => {
    let testingOpts
    let buildOpts
    beforeEach((done) => {
      testingOpts = {
        isTesting,
        isTestReporter
      }
      buildOpts = {
        isolated: objectId('407f191e810c19729de860e1'),
        masterShorthash: 'asdasdsad',
        clusterCreateId,
        mainInstanceServiceName: 'a1'
      }
      sinon.stub(InstanceService, 'createInstance')
      done()
    })

    afterEach((done) => {
      InstanceService.createInstance.restore()
      done()
    })

    it('should create instance', () => {
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
      const composeData = {
        metadata: {
          name: 'a1',
          isMain: true
        },
        instance: testParentComposeData,
        build: {
          dockerFilePath: 'Nathan219/hello'
        }
      }
      const testInstance = 'build'
      InstanceService.createInstance.resolves(testInstance)

      return ClusterConfigService._createInstance(testSessionUser, composeData, testParentBuildId, testingOpts, buildOpts)
        .then(instance => {
          sinon.assert.calledOnce(InstanceService.createInstance)
          sinon.assert.calledWithExactly(InstanceService.createInstance, {
            shortName: composeData.metadata.name,
            build: testParentBuildId,
            aliases: testParentComposeData.aliases,
            env: testParentComposeData.env,
            containerStartCommand: testParentComposeData.containerStartCommand,
            name: buildOpts.masterShorthash + '--' + testParentComposeData.name,
            isTesting,
            isTestReporter,
            clusterCreateId,
            isolated: buildOpts.isolated,
            isIsolationGroupMaster: false,
            shouldNotAutofork: false,
            masterPod: false,
            ipWhitelist: {
              enabled: false
            }
          }, testSessionUser)

          expect(instance).to.equal(testInstance)
        })
    })

    it('should create non-test non-isolated instance', () => {
      testingOpts.isTesting = false
      delete buildOpts.isolated
      const clusterCreateId = 'aaaaaaa'
      buildOpts.clusterCreateId = 'aaaaaaa'
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
      testingOpts.isTesting = false
      const composeData = {
        metadata: {
          name: 'b1'
        },
        instance: testParentComposeData
      }
      const testInstance = 'build'
      InstanceService.createInstance.resolves(testInstance)

      return ClusterConfigService._createInstance(testSessionUser, composeData, testParentBuildId, testingOpts, buildOpts)
        .then(instance => {
          sinon.assert.calledOnce(InstanceService.createInstance)
          sinon.assert.calledWithExactly(InstanceService.createInstance, {
            build: testParentBuildId,
            shortName: composeData.metadata.name,
            env: testParentComposeData.env,
            aliases: testParentComposeData.aliases,
            containerStartCommand: testParentComposeData.containerStartCommand,
            name: testParentComposeData.name,
            shouldNotAutofork: true,  // doesn't have a repo
            isTesting: false,
            isTestReporter,
            masterPod: true,
            isolated: undefined,
            clusterCreateId,
            ipWhitelist: {
              enabled: false
            }
          }, testSessionUser)

          expect(instance).to.equal(testInstance)
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

  describe('_updateInstanceWithConfigs', () => {
    let instanceMock
    let testConfig
    let sessionUser
    let instanceObj
    let mainACVMock
    let orgInfo
    let buildMock
    let buildOpts = {
      repoFullName: 'asdasd/sadasdasd',
      triggerAction: 'autodeploy'
    }
    beforeEach((done) => {
      sessionUser = {
        accounts: {
          github: {
            id: ownerInfo.githubUserId
          }
        }
      }
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
        name: 'test',
        getRepoName: sinon.stub().returns('org/repoName'),
        contextVersion: {
          context: 'contextId1234',
          buildDockerfilePath: 'path/to/Dockerfile',
          appCodeVersions: []
        }
      }
      instanceObj = {
        instance: instanceMock,
        config: {
          instance: testConfig,
          build: {
            dockerFilePath: 'path/to/Dockerfile'
          },
          code: {
            commitish: 'mainBranchName'
          }
        }
      }
      mainACVMock = {
        branch: 'mainBranchName',
        commit: 'sha1234'
      }
      buildMock = {
        _id: 'foo'
      }
      sinon.stub(InstanceService, 'updateInstance').resolves(instanceMock)
      sinon.stub(ClusterConfigService, '_createCVAndBuildBuild').resolves(buildMock)
      sinon.stub(ContextVersion, 'getMainAppCodeVersion').returns(mainACVMock)
      sinon.stub(rabbitMQ, 'redeployInstanceContainer')
      done()
    })

    afterEach((done) => {
      InstanceService.updateInstance.restore()
      ClusterConfigService._createCVAndBuildBuild.restore()
      ContextVersion.getMainAppCodeVersion.restore()
      rabbitMQ.redeployInstanceContainer.restore()
      done()
    })

    describe('when dockerfile path changes', () => {
      beforeEach((done) => {
        instanceObj.config.build = {
          dockerfilePath: 'new/path/to/Dockerfile'
        }
        done()
      })
      it('should create a new build and update the instance', () => {
        return ClusterConfigService._updateInstanceWithConfigs(sessionUser, instanceObj, buildOpts, ownerInfo)
          .then(() => {
            sinon.assert.calledOnce(ClusterConfigService._createCVAndBuildBuild)
            sinon.assert.calledWithExactly(ClusterConfigService._createCVAndBuildBuild,
              sessionUser,
              ownerInfo,
              buildOpts,
              instanceObj.config
            )
            sinon.assert.calledOnce(InstanceService.updateInstance)
            sinon.assert.calledWithExactly(InstanceService.updateInstance,
              instanceMock, {
                aliases: testConfig.aliases,
                env: testConfig.env,
                ports: testConfig.ports,
                build: 'foo',
                containerStartCommand: testConfig.containerStartCommand
              },
              sessionUser
            )
            sinon.assert.calledOnce(rabbitMQ.redeployInstanceContainer)
            sinon.assert.calledWithExactly(rabbitMQ.redeployInstanceContainer, {
              instanceId: '1',
              sessionUserGithubId: testUserGithubId
            })
          })
      })
    })

    describe('when commit changes', () => {
      beforeEach((done) => {
        instanceObj.config.code.commitish = 'sha4567'
        done()
      })
      it('should create a new build and update the instance', () => {
        return ClusterConfigService._updateInstanceWithConfigs(sessionUser, instanceObj, buildOpts, ownerInfo)
          .then(() => {
            sinon.assert.calledOnce(ClusterConfigService._createCVAndBuildBuild)
            sinon.assert.calledWithExactly(
              ClusterConfigService._createCVAndBuildBuild,
              sessionUser,
              ownerInfo,
              buildOpts,
              instanceObj.config
            )
            sinon.assert.calledOnce(InstanceService.updateInstance)
            sinon.assert.calledWithExactly(InstanceService.updateInstance,
              instanceMock, {
                aliases: testConfig.aliases,
                env: testConfig.env,
                ports: testConfig.ports,
                build: 'foo',
                containerStartCommand: testConfig.containerStartCommand
              },
              sessionUser
            )
            sinon.assert.calledOnce(rabbitMQ.redeployInstanceContainer)
            sinon.assert.calledWithExactly(rabbitMQ.redeployInstanceContainer, {
              instanceId: '1',
              sessionUserGithubId: testUserGithubId
            })
          })
      })
    })

    describe('when branch changes', () => {
      beforeEach((done) => {
        instanceObj.config.code.commitish = 'newBranchName'
        done()
      })
      it('should create a new build and update the instance', () => {
        return ClusterConfigService._updateInstanceWithConfigs(sessionUser, instanceObj, buildOpts, ownerInfo)
          .then(() => {
            sinon.assert.calledOnce(ClusterConfigService._createCVAndBuildBuild)
            sinon.assert.calledWithExactly(
              ClusterConfigService._createCVAndBuildBuild,
              sessionUser,
              ownerInfo,
              buildOpts,
              instanceObj.config
            )
            sinon.assert.calledOnce(InstanceService.updateInstance)
            sinon.assert.calledWithExactly(InstanceService.updateInstance,
              instanceMock, {
                aliases: testConfig.aliases,
                env: testConfig.env,
                ports: testConfig.ports,
                build: 'foo',
                containerStartCommand: testConfig.containerStartCommand
              },
              sessionUser
            )
            sinon.assert.calledOnce(rabbitMQ.redeployInstanceContainer)
            sinon.assert.calledWithExactly(rabbitMQ.redeployInstanceContainer, {
              instanceId: '1',
              sessionUserGithubId: testUserGithubId
            })
          })
      })
    })

    describe('when env changes', () => {
      beforeEach((done) => {
        testConfig.env = ['newEnv']
        done()
      })
      it('should update the instance and redeploy it', () => {
        return ClusterConfigService._updateInstanceWithConfigs(sessionUser, instanceObj, buildOpts, ownerInfo)
          .then(() => {
            sinon.assert.notCalled(ClusterConfigService._createCVAndBuildBuild)
            sinon.assert.calledOnce(InstanceService.updateInstance)
            sinon.assert.calledWithExactly(InstanceService.updateInstance,
              instanceMock, {
                aliases: testConfig.aliases,
                env: testConfig.env,
                ports: testConfig.ports,
                containerStartCommand: testConfig.containerStartCommand
              },
              sessionUser
            )
            sinon.assert.calledOnce(rabbitMQ.redeployInstanceContainer)
            sinon.assert.calledWithExactly(rabbitMQ.redeployInstanceContainer, {
              instanceId: '1',
              sessionUserGithubId: testUserGithubId
            })
          })
      })
    })
  }) // end _updateInstanceWithConfigs

  // describe('_createNewInstanceForNewConfig', () => {
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
  //     ClusterConfigService._createNewInstanceForNewConfig({
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
  //     ClusterConfigService._createNewInstanceForNewConfig(testMainParsedContent, 1)
  //     sinon.assert.notCalled(rabbitMQ.createClusterInstance)
  //     done()
  //   })
  //
  //   it('should not call create if instance missing config', (done) => {
  //     ClusterConfigService._createNewInstanceForNewConfig(testMainParsedContent, 1)
  //     sinon.assert.notCalled(rabbitMQ.createClusterInstance)
  //     done()
  //   })
  // }) // end _createNewInstanceForNewConfig

  describe('_mergeConfigsIntoInstances', () => {
    it('should output list of configs and instances', (done) => {
      const out = ClusterConfigService._mergeConfigsIntoInstances(
        [{metadata: {name: '1'}}, {metadata: {name: '4'}}],
        [getInstanceMock('1'), getInstanceMock('2')]
      )
      expect(out.length).to.equal(3)
      expect(out[0].instance.name).to.equal('1')
      expect(out[0].config.metadata.name).to.equal('1')
      expect(out[1].instance.name).to.equal('2')
      expect(out[1].config).to.equal(undefined)
      done()
    })
  }) // end _mergeConfigsIntoInstances

  describe('_addConfigToInstances', () => {
    it('should add instances and missing configs into array', (done) => {
      const out = ClusterConfigService._addConfigToInstances(
        [{metadata: {name: '1'}}, {metadata: {name: '4'}}],
        [getInstanceMock('1'), getInstanceMock('2')]
      )
      expect(out.length).to.equal(2)
      expect(out[0].instance.name).to.equal('1')
      expect(out[0].config.metadata.name).to.equal('1')
      expect(out[1].instance.name).to.equal('2')
      expect(out[1].config).to.equal(undefined)
      done()
    })
  }) // end _addConfigToInstances

  describe('_addMissingConfigs', () => {
    it('should add missing configs to array', (done) => {
      const out = ClusterConfigService._addMissingConfigs(
        [{metadata: {name: '1'}}, {metadata: {name: '4'}}],
        [{instance: {shortName: '1'}}, {instance: {shortName: '2'}}]
      )
      expect(out).to.equal([{instance: {shortName: '1'}}, {instance: {shortName: '2'}}, {config: {metadata: {name: '4'}}}])
      done()
    })
  }) // end _addMissingConfigs

  describe('_isConfigMissingInstance', () => {
    it('should return false if config has an instance', (done) => {
      const out = ClusterConfigService._isConfigMissingInstance(
        [{instance: {shortName: '1'}}, {instance: {shortName: '2'}}, {instance: {shortName: '3'}}],
        {metadata: {name: '1'}}
      )

      expect(out).to.be.false()
      done()
    })

    it('should return true if config does not have an instance', (done) => {
      const out = ClusterConfigService._isConfigMissingInstance(
        [{instance: {shortName: '1'}}, {instance: {shortName: '2'}}, {instance: {shortName: '3'}}],
        {metadata: {name: '5'}}
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
      sinon.stub(ClusterConfigService, 'parseComposeFileAndPopulateENVs').resolves(testParsedContent)
      sinon.stub(ClusterConfigService, 'createFromRunnableConfig').resolves()
      done()
    })
    afterEach(function (done) {
      GitHub.prototype.getRepoContent.restore()
      ClusterConfigService.parseComposeFileAndPopulateENVs.restore()
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
              commitRef,
              repo: repoFullName,
              sha: dockerComposeContent.sha,
              path: filePath,
            })
          })
          .asCallback(done)
      })
    })
  })
  describe('checkIfComposeFilesChanged', function () {
    const path = 'config/compose.yml'
    const clusterConfigFiles = [
      {
        path,
        sha: '13ec49b1014891c7b494126226f95e318e1d3e82'
      }
    ]
    const changedClusterConfigFiles = [
      {
        path,
        sha: 'dfasdf3qaf3afa3wfa3faw3weas3asfa2eqdqd2q2'
      }
    ]
    const clusterConfig = {
      files: clusterConfigFiles
    }
    const orgName = 'Runnable'
    const bpUserId = 2
    const userModel = {}
    const instanceId = 'sadasdada233awad'
    const repoName = 'api'
    const repoFullName = orgName + '/' + repoName
    const githubPushInfo = {
      bpUserId,
      repo: repoFullName
    }
    const aic = {
      instance: instanceId
    }
    const parentAic = {
      instance: 'asdasdasdassa'
    }
    const instance = {
      _id: instanceId
    }

    beforeEach(function (done) {
      sinon.stub(ClusterConfigService, 'fetchConfigByInstanceId').resolves(clusterConfig)
      sinon.stub(AutoIsolationService, 'fetchAutoIsolationForInstance').resolves(aic)
      sinon.stub(UserService, 'getByBpId').resolves(userModel)
      sinon.stub(ClusterConfigService, 'fetchFilesFromGithub').resolves(changedClusterConfigFiles)
      done()
    })
    afterEach(function (done) {
      ClusterConfigService.fetchConfigByInstanceId.restore()
      AutoIsolationService.fetchAutoIsolationForInstance.restore()
      UserService.getByBpId.restore()
      ClusterConfigService.fetchFilesFromGithub.restore()
      done()
    })
    describe('errors', function () {
      it('should return error if fetchConfigByInstanceId failed', function (done) {
        const error = new Error('Some error')
        ClusterConfigService.fetchConfigByInstanceId.rejects(error)
        ClusterConfigService.checkIfComposeFilesChanged(instance, githubPushInfo)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })
      it('should return error if UserService.getByBpId failed', function (done) {
        const error = new Error('Some error')
        UserService.getByBpId.rejects(error)
        ClusterConfigService.checkIfComposeFilesChanged(instance, githubPushInfo)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })
      it('should return error if ClusterConfigService.fetchFilesFromGithub failed', function (done) {
        const error = new Error('Some error')
        ClusterConfigService.fetchFilesFromGithub.rejects(error)
        ClusterConfigService.checkIfComposeFilesChanged(instance, githubPushInfo)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })
    })
    describe('success', function () {
      it('should run successfully', function () {
        ClusterConfigService.fetchFilesFromGithub.resolves(changedClusterConfigFiles)
        return ClusterConfigService.checkIfComposeFilesChanged(instance, githubPushInfo)
      })
      it('should return InputClusterConfig.NotChangedError if shas match', function (done) {
        ClusterConfigService.fetchFilesFromGithub.resolves(clusterConfigFiles)
        ClusterConfigService.checkIfComposeFilesChanged(instance, githubPushInfo)
          .then(function () {
            done(new Error('Expecting NotChangedError'))
          })
          .catch(InputClusterConfig.NotChangedError, function () {
            done()
          })
      })
      it('should not return InputClusterConfig.NotChangedError if aic is parent\'s', function () {
        ClusterConfigService.fetchFilesFromGithub.resolves(changedClusterConfigFiles)
        AutoIsolationService.fetchAutoIsolationForInstance.resolves(parentAic)
        return ClusterConfigService.checkIfComposeFilesChanged(instance, githubPushInfo)
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
    const depRepoWithBuildInstanceObj = {
      config: {
        metadata: {
          isMain: false
        },
        build: {
          dockerFilePath: '/Dockerfile.server'
        },
        code: {}
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
        ClusterConfigService._createAutoIsolationModelsFromClusterInstances(instances, mainInstance)
        done()
      })
      it('should return main instance and dep', function (done) {
        instances = [mainInstanceObj, depInstanceObj]
        const model = ClusterConfigService._createAutoIsolationModelsFromClusterInstances(instances, mainInstance)
        expect(model).to.exist()
        expect(model.instance).to.equal(mainInstanceId)
        expect(model.requestedDependencies.length).to.equal(1)
        expect(model.requestedDependencies[0].instance).to.equal(depInstanceId)
        expect(model.requestedDependencies[0].matchBranch).to.be.undefined()
        done()
      })
      it('should return main instance and matched-branched dep', function (done) {
        instances = [mainInstanceObj, depRepoInstanceObj]
        const model = ClusterConfigService._createAutoIsolationModelsFromClusterInstances(instances, mainInstance)
        expect(model).to.exist()
        expect(model.instance).to.equal(mainInstanceId)
        expect(model.requestedDependencies.length).to.equal(1)
        expect(model.requestedDependencies[0].instance).to.equal(depRepoInstanceId)
        expect(model.requestedDependencies[0].matchBranch).to.be.undefined()
        done()
      })
      it('should return main instance and both deps', function (done) {
        instances = [mainInstanceObj, depRepoInstanceObj, depInstanceObj]
        const model = ClusterConfigService._createAutoIsolationModelsFromClusterInstances(instances, mainInstance)
        expect(model).to.exist()
        expect(model.instance).to.equal(mainInstanceId)
        expect(model.requestedDependencies.length).to.equal(2)
        expect(model.requestedDependencies[0].instance).to.equal(depRepoInstanceId)
        expect(model.requestedDependencies[0].matchBranch).to.be.undefined()
        expect(model.requestedDependencies[1].instance).to.equal(depInstanceId)
        expect(model.requestedDependencies[1].matchBranch).to.be.undefined()
        done()
      })
      it('should return main instance and matched-branched dep', function (done) {
        instances = [mainInstanceObj, depRepoWithBuildInstanceObj]
        const model = ClusterConfigService._createAutoIsolationModelsFromClusterInstances(instances, mainInstance)
        expect(model).to.exist()
        expect(model.instance).to.equal(mainInstanceId)
        expect(model.requestedDependencies.length).to.equal(1)
        expect(model.requestedDependencies[0].instance).to.equal(depRepoInstanceId)
        expect(model.requestedDependencies[0].matchBranch).to.equal(true)
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
    const clusterOpts = {
      isTesting: true
    }
    const mainInstanceId = objectId('407f191e810c19729de860ef')
    const updateInstanceId = objectId('407f191e810c19729de860f1')
    const deleteInstanceId = objectId('407f191e810c19729de860f2')
    const createInstanceId = objectId('407f191e810c19729de860f3')
    const mainInstance = {
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
    const buildOpts = {
      repoFullName,
      triggerAction: 'autodeploy'
    }
    let instances
    beforeEach(function (done) {
      instances = []
      done()
    })
    beforeEach(function (done) {
      sinon.stub(ClusterConfigService, 'addAliasesToContexts').returns()
      sinon.stub(ClusterConfigService, 'createClusterContext').resolves(createInstanceConfig)
      sinon.stub(ClusterConfigService, '_updateInstanceWithConfigs').resolves(updateInstanceObj)
      sinon.stub(ClusterConfigService, '_createNewInstanceForNewConfig').resolves(postCreateInstanceObj)
      sinon.stub(rabbitMQ, 'deleteInstance').returns()
      done()
    })
    afterEach(function (done) {
      ClusterConfigService.addAliasesToContexts.restore()
      ClusterConfigService.createClusterContext.restore()
      ClusterConfigService._updateInstanceWithConfigs.restore()
      ClusterConfigService._createNewInstanceForNewConfig.restore()
      rabbitMQ.deleteInstance.restore()
      done()
    })
    describe('success', function () {
      beforeEach(function (done) {
        instances = [updateInstanceObj, deleteInstanceObj, preCreateInstanceObj]
        done()
      })
      it('should run successfully', function () {
        return ClusterConfigService._createUpdateAndDeleteInstancesForClusterUpdate(
          testSessionUser,
          instances,
          clusterOpts,
          buildOpts,
          ownerInfo
        )
      })
      it('should resolve with an array with 2 instances in it', function (done) {
        ClusterConfigService._createUpdateAndDeleteInstancesForClusterUpdate(
          testSessionUser,
          instances,
          clusterOpts,
          buildOpts,
          ownerInfo
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
          clusterOpts,
          buildOpts,
          ownerInfo
        )
          .then(() => {
            sinon.assert.callOrder(
              ClusterConfigService.createClusterContext,
              ClusterConfigService.addAliasesToContexts,
              ClusterConfigService._createNewInstanceForNewConfig,
              ClusterConfigService._updateInstanceWithConfigs
            )
          })
          .asCallback(done)
      })
      it('should have called update with updateInstance', function (done) {
        ClusterConfigService._createUpdateAndDeleteInstancesForClusterUpdate(
          testSessionUser,
          instances,
          clusterOpts,
          buildOpts,
          ownerInfo
        )
          .then(() => {
            sinon.assert.calledOnce(ClusterConfigService._updateInstanceWithConfigs)
            sinon.assert.calledWithExactly(
              ClusterConfigService._updateInstanceWithConfigs,
              testSessionUser,
              updateInstanceObj,
              buildOpts,
              ownerInfo
            )
          })
          .asCallback(done)
      })
      it('should have called create with createInstance', function (done) {
        ClusterConfigService._createUpdateAndDeleteInstancesForClusterUpdate(
          testSessionUser,
          instances,
          clusterOpts,
          buildOpts,
          ownerInfo
        )
          .then(() => {
            sinon.assert.calledOnce(ClusterConfigService._createNewInstanceForNewConfig)
            sinon.assert.calledWithExactly(
              ClusterConfigService._createNewInstanceForNewConfig,
              testSessionUser,
              preCreateInstanceObj.config,
              clusterOpts,
              buildOpts,
              ownerInfo
            )
          })
          .asCallback(done)
      })
      it('should have given addAliasesToContexts the update and created configs ', function (done) {
        ClusterConfigService._createUpdateAndDeleteInstancesForClusterUpdate(
          testSessionUser,
          instances,
          clusterOpts,
          buildOpts,
          ownerInfo
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
          clusterOpts,
          buildOpts,
          ownerInfo
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
    const autoIsolationObject = {
      _id: 'asdasdasdasd',
      instance: mainInstanceId,
      requestedDependencies: [depInstance, depRepoInstance]
    }
    const instanceObjs = [mainInstanceObj, depInstanceObj, depRepoInstanceObj]
    const octobearInfo = {}
    const clusterOpts = {}
    let instances
    beforeEach(function (done) {
      sinon.stub(AutoIsolationService, 'fetchAutoIsolationDependentInstances').resolves(instanceObjs)
      sinon.stub(ClusterConfigService, '_mergeConfigsIntoInstances').resolves(instanceObjs)
      sinon.stub(ClusterConfigService, '_createUpdateAndDeleteInstancesForClusterUpdate').resolves(instanceObjs)
      sinon.stub(ClusterConfigService, 'updateIsolationConfig').resolves(autoIsolationObject)
      sinon.stub(rabbitMQ, 'autoDeployInstance').resolves()
      done()
    })
    afterEach(function (done) {
      AutoIsolationService.fetchAutoIsolationDependentInstances.restore()
      ClusterConfigService._mergeConfigsIntoInstances.restore()
      ClusterConfigService._createUpdateAndDeleteInstancesForClusterUpdate.restore()
      ClusterConfigService.updateIsolationConfig.restore()
      rabbitMQ.autoDeployInstance.restore()
      done()
    })
    describe('success', function () {
      it('should run successfully', function (done) {
        ClusterConfigService.updateCluster(testSessionUser, mainInstance, githubPushInfo, octobearInfo, clusterOpts)
          .asCallback(done)
      })
      it('should call all the methods in order', function (done) {
        ClusterConfigService.updateCluster(testSessionUser, mainInstance, githubPushInfo, octobearInfo, clusterOpts)
          .then(() => {
            sinon.assert.callOrder(
              AutoIsolationService.fetchAutoIsolationDependentInstances,
              ClusterConfigService._mergeConfigsIntoInstances,
              ClusterConfigService._createUpdateAndDeleteInstancesForClusterUpdate,
              ClusterConfigService.updateIsolationConfig
            )
          })
          .asCallback(done)
      })
      it('should call fetchAutoIsolationDependentInstances with the mainInstance', function (done) {
        ClusterConfigService.updateCluster(testSessionUser, mainInstance, githubPushInfo, octobearInfo, clusterOpts)
          .then(() => {
            sinon.assert.calledOnce(AutoIsolationService.fetchAutoIsolationDependentInstances)
            sinon.assert.calledWithExactly(AutoIsolationService.fetchAutoIsolationDependentInstances, mainInstance)
          })
          .asCallback(done)
      })
      it('should call _mergeConfigsIntoInstances with all three instances (including main)', function (done) {
        ClusterConfigService.updateCluster(testSessionUser, mainInstance, githubPushInfo, octobearInfo, clusterOpts)
          .then(() => {
            sinon.assert.calledOnce(ClusterConfigService._mergeConfigsIntoInstances)
            sinon.assert.calledWithExactly(ClusterConfigService._mergeConfigsIntoInstances, octobearInfo, instanceObjs)
          })
          .asCallback(done)
      })
      it('should call _createUpdateAndDeleteInstancesForClusterUpdate with the right inputs', () => {
        return ClusterConfigService.updateCluster(testSessionUser, mainInstance, githubPushInfo, octobearInfo, clusterOpts)
          .then(() => {
            sinon.assert.calledOnce(ClusterConfigService._createUpdateAndDeleteInstancesForClusterUpdate)
            sinon.assert.calledWithExactly(
              ClusterConfigService._createUpdateAndDeleteInstancesForClusterUpdate,
              testSessionUser,
              instanceObjs,
              clusterOpts,
              sinon.match({
                isolated: undefined,
                repoFullName,
                triggeredAction: 'autodeploy'
              }),
              ownerInfo
            )
          })
      })
      it('should call updateIsolationConfig with the right inputs', () => {
        return ClusterConfigService.updateCluster(testSessionUser, mainInstance, githubPushInfo, octobearInfo, clusterOpts)
          .then(() => {
            sinon.assert.calledOnce(ClusterConfigService.updateIsolationConfig)
            sinon.assert.calledWithExactly(
              ClusterConfigService.updateIsolationConfig,
              ownerInfo,
              instanceObjs,
              clusterOpts,
              mainInstance
            )
          })
      })
      it('should call autoDeployInstance with the right inputs', () => {
        return ClusterConfigService.updateCluster(testSessionUser, mainInstance, githubPushInfo, octobearInfo, clusterOpts)
          .then(() => {
            sinon.assert.calledOnce(rabbitMQ.autoDeployInstance)
            sinon.assert.calledWithExactly(
              rabbitMQ.autoDeployInstance, {
                instanceId: mainInstance._id.toString(),
                pushInfo: githubPushInfo
              })
          })
      })
    })
  })

  describe('parseComposeFileAndPopulateENVs', () => {
    const mainInstanceName = 'mainInstanceName'
    const bigPoppaUser = {
      _id: 'user-id'
    }
    const repoFullName = 'Runnable/octobear'
    const commit = 'asdasdasdasdsa'

    const fileString = 'compose-file'
    const envFiles = ['./env', './docker/.env', './wow/.env']
    const composeFiles = [
        'compose1.yml'
      ]
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
      sinon.stub(octobear, 'populateENVsFromFiles').resolves(parseResult.results)
      sinon.stub(octobear, 'findExtendedFiles').resolves(composeFiles)
      sinon.stub(octobear, 'parseAndMergeMultiple').resolves(parseResult)
      sinon.stub(ClusterConfigService, 'fetchFilesFromGithub').resolves([{ fileString, path: './main-compose.yml' }])
      sinon.stub(ClusterConfigService, 'fetchFileFromGithub').resolves({ fileString, path: './compose1.yml' })
      sinon.stub(ClusterConfigService, 'updateBuildContextForEachService').resolves({})
      done()
    })
    afterEach(done => {
      octobear.parseAndMergeMultiple.restore()
      octobear.populateENVsFromFiles.restore()
      octobear.findExtendedFiles.restore()
      ClusterConfigService.fetchFilesFromGithub.restore()
      ClusterConfigService.fetchFileFromGithub.restore()
      ClusterConfigService.updateBuildContextForEachService.restore()
      done()
    })

    it('should call `parseAndMergeMultiple`', () => {
      const fileName = '/compose.yml'
      return ClusterConfigService.parseComposeFileAndPopulateENVs(repoFullName, mainInstanceName, bigPoppaUser, fileName, commit)
        .then(result => {
          sinon.assert.calledOnce(octobear.findExtendedFiles)
          sinon.assert.calledWithExactly(
            octobear.findExtendedFiles,
            fileString
          )
          sinon.assert.calledOnce(ClusterConfigService.fetchFilesFromGithub)
          sinon.assert.calledWithExactly(
            ClusterConfigService.fetchFilesFromGithub,
            bigPoppaUser, repoFullName, composeFiles
          )
          sinon.assert.calledOnce(octobear.parseAndMergeMultiple)
          sinon.assert.calledWithExactly(
            octobear.parseAndMergeMultiple,
            {
              dockerComposeFilePath: '/compose.yml',
              ownerUsername: 'runnable',
              repositoryName: 'mainInstanceName',
              scmDomain: 'github.com',
              userContentDomain: 'runnableapp.com'
            },
            [{
              dockerComposeFilePath: './compose1.yml',
              dockerComposeFileString: 'compose-file'
            }, {
              dockerComposeFilePath: './main-compose.yml',
              dockerComposeFileString: 'compose-file'
            }]
          )
          sinon.assert.calledOnce(octobear.populateENVsFromFiles)
          sinon.assert.callCount(ClusterConfigService.fetchFileFromGithub, 4)
          sinon.assert.calledWithExactly(
            ClusterConfigService.fetchFileFromGithub,
            bigPoppaUser, repoFullName, './env', commit
          )
          sinon.assert.calledOnce(ClusterConfigService.updateBuildContextForEachService)
          sinon.assert.calledWithExactly(
            ClusterConfigService.updateBuildContextForEachService,
            fileName,
            sinon.match.array
          )
        })
    })

    it('should not fetch any files for `envFiles` if they are empty', () => {
      parseResult.envFiles = []
      return ClusterConfigService.parseComposeFileAndPopulateENVs(repoFullName, mainInstanceName, bigPoppaUser, '/compose.yml', commit)
        .then(result => {
          // called only for fetching main compose file
          sinon.assert.calledOnce(ClusterConfigService.fetchFileFromGithub)
        })
    })

    it('should fetch all files in `envFiles`', () => {
      return ClusterConfigService.parseComposeFileAndPopulateENVs(repoFullName, mainInstanceName, bigPoppaUser, '/compose.yml', commit)
        .then(result => {
          sinon.assert.called(ClusterConfigService.fetchFileFromGithub)
          // skip first call that fetch compose file
          sinon.assert.callCount(ClusterConfigService.fetchFileFromGithub, envFiles.length + 1)
          sinon.assert.calledWithExactly(
            ClusterConfigService.fetchFileFromGithub.getCall(1),
            bigPoppaUser,
            repoFullName,
            envFiles[0],
            commit
          )
          sinon.assert.calledWithExactly(
            ClusterConfigService.fetchFileFromGithub.getCall(2),
            bigPoppaUser,
            repoFullName,
            envFiles[1],
            commit
          )
          sinon.assert.calledWithExactly(
            ClusterConfigService.fetchFileFromGithub.getCall(3),
            bigPoppaUser,
            repoFullName,
            envFiles[2],
            commit
          )
        })
    })

    it('should call `populateENVsFromFiles`', () => {
      return ClusterConfigService.parseComposeFileAndPopulateENVs(repoFullName, mainInstanceName, bigPoppaUser, '/compose.yml', commit)
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
      return ClusterConfigService.parseComposeFileAndPopulateENVs(repoFullName, mainInstanceName, bigPoppaUser, '/compose.yml', commit)
        .then(res => {
          expect(res.results).to.be.an.array()
          expect(res.results).to.equal(parseResult.results)
        })
    })
  })

  describe('updateBuildContextForEachService', () => {
    it('should do nothing for services without builds', (done) => {
      const services = [
        { instance: { name: 'a1' } }, { instance: { name: 'a2' } }
      ]
      ClusterConfigService.updateBuildContextForEachService('/compose.yml', services)
      expect(services.length).to.equal(2)
      expect(services[0].build).to.equal(undefined)
      expect(services[1].build).to.equal(undefined)
      done()
    })

    it('should update build context if compose is in the root', (done) => {
      const services = [
        {
          build: {
            dockerBuildContext: '.'
          },
          instance: { name: 'a1' }
        }, {
          instance: { name: 'a2' }
        }
      ]
      ClusterConfigService.updateBuildContextForEachService('/compose.yml', services)
      expect(services.length).to.equal(2)
      expect(services[0].build.dockerBuildContext).to.equal('./')
      expect(services[1].build).to.equal(undefined)
      done()
    })

    it('should update build context if compose is not in the root', (done) => {
      const services = [
        {
          build: {
            dockerBuildContext: '..'
          },
          instance: { name: 'a1' }
        }, {
          instance: { name: 'a2' }
        }
      ]
      ClusterConfigService.updateBuildContextForEachService('/src/compose.yml', services)
      expect(services.length).to.equal(2)
      expect(services[0].build.dockerBuildContext).to.equal('./')
      expect(services[1].build).to.equal(undefined)
      done()
    })
    describe('unformatted path without /', () => {
      it('should do nothing for services without builds', (done) => {
        const services = [
          { instance: { name: 'a1' } }, { instance: { name: 'a2' } }
        ]
        ClusterConfigService.updateBuildContextForEachService('compose.yml', services)
        expect(services.length).to.equal(2)
        expect(services[0].build).to.equal(undefined)
        expect(services[1].build).to.equal(undefined)
        done()
      })

      it('should update build context if compose is in the root', (done) => {
        const services = [
          {
            build: {
              dockerBuildContext: '.'
            },
            instance: { name: 'a1' }
          }, {
            instance: { name: 'a2' }
          }
        ]
        ClusterConfigService.updateBuildContextForEachService('compose.yml', services)
        expect(services.length).to.equal(2)
        expect(services[0].build.dockerBuildContext).to.equal('./')
        expect(services[1].build).to.equal(undefined)
        done()
      })

      it('should update build context if compose is not in the root', (done) => {
        const services = [
          {
            build: {
              dockerBuildContext: '..'
            },
            instance: { name: 'a1' }
          }, {
            instance: { name: 'a2' }
          }
        ]
        ClusterConfigService.updateBuildContextForEachService('src/compose.yml', services)
        expect(services.length).to.equal(2)
        expect(services[0].build.dockerBuildContext).to.equal('./')
        expect(services[1].build).to.equal(undefined)
        done()
      })
    })

    describe('unformatted path with ./', () => {
      it('should do nothing for services without builds', (done) => {
        const services = [
          { instance: { name: 'a1' } }, { instance: { name: 'a2' } }
        ]
        ClusterConfigService.updateBuildContextForEachService('./compose.yml', services)
        expect(services.length).to.equal(2)
        expect(services[0].build).to.equal(undefined)
        expect(services[1].build).to.equal(undefined)
        done()
      })

      it('should update build context if compose is in the root', (done) => {
        const services = [
          {
            build: {
              dockerBuildContext: '.'
            },
            instance: { name: 'a1' }
          }, {
            instance: { name: 'a2' }
          }
        ]
        ClusterConfigService.updateBuildContextForEachService('./compose.yml', services)
        expect(services.length).to.equal(2)
        expect(services[0].build.dockerBuildContext).to.equal('./')
        expect(services[1].build).to.equal(undefined)
        done()
      })

      it('should update build context if compose is not in the root', (done) => {
        const services = [
          {
            build: {
              dockerBuildContext: '..'
            },
            instance: { name: 'a1' }
          }, {
            instance: { name: 'a2' }
          }
        ]
        ClusterConfigService.updateBuildContextForEachService('./src/compose.yml', services)
        expect(services.length).to.equal(2)
        expect(services[0].build.dockerBuildContext).to.equal('./')
        expect(services[1].build).to.equal(undefined)
        done()
      })
    })
  })

  describe('fetchComposeInfoByInstanceId', function () {
    const filePath = 'config/compose.yml'
    const fileString = 'version: \'2\'\nservices:\n  web:\n    build: \'./src/\'\n    command: [node, index.js]\n    ports:\n      - "5000:5000"\n    environment:\n      - NODE_ENV=development\n      - SHOW=true\n      - HELLO=678\n'
    const orgName = 'runnable'
    const ownerUsername = orgName.toLowerCase()
    const repoName = 'api'
    const repoFullName = orgName + '/' + repoName
    const branchName = 'feature-1'
    const clusterName = 'api-unit'
    const dockerComposeContent = {
      fileString: fileString,
      filePath: filePath,
      fileSha: '13ec49b1014891c7b494126226f95e318e1d3e82',
      repo: repoFullName,
      commitRef: 'asdasdasdsadasdasd'
    }
    const instanceId = 'asdfas34arfw3fwdasafsdf'
    const commitSha = 'abcc0b9'
    const branchMock = {
      commit: {
        sha: commitSha
      }
    }
    let testData = {}
    let config = {}

    beforeEach(done =>{
      testData = {
        repo: repoFullName,
        branch: branchName,
        clusterName,
        filePath,
        isTesting,
        testReporters,
        parentInputClusterConfigId
      }
      config = {
        repo: repoFullName,
        branch: branchName,
        clusterName,
        files: [{
          path: filePath,
          sha: 'filesha'
        }],
        isTesting,
        testReporters,
        parentInputClusterConfigId
      }
      done()
    })

    beforeEach(function (done) {
      sinon.stub(ClusterConfigService, '_parseComposeInfoForConfig').resolves()
      sinon.stub(ClusterConfigService, 'fetchConfigByInstanceId').resolves(config)
      done()
    })
    afterEach(function (done) {
      ClusterConfigService._parseComposeInfoForConfig.restore()
      ClusterConfigService.fetchConfigByInstanceId.restore()
      done()
    })
    describe('errors', function () {
      it('should return error if _parseComposeInfoForConfig failed', function (done) {
        const error = new Error('Some error')
        ClusterConfigService._parseComposeInfoForConfig.rejects(error)
        ClusterConfigService.fetchComposeInfoByInstanceId(testSessionUser, instanceId)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })

      it('should return error if fetchConfigByInstanceId failed', function (done) {
        const error = new Error('Some error')
        ClusterConfigService.fetchConfigByInstanceId.rejects(error)
        ClusterConfigService.fetchComposeInfoByInstanceId(testSessionUser, instanceId)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })
    })

    describe('success', function () {
      it('should run successfully without clusterInfo, but with instanceId', function () {
        return ClusterConfigService.fetchComposeInfoByInstanceId(testSessionUser, instanceId)
      })

      it('should call fetchConfigByInstanceId when an instanceId is given', function () {
        return ClusterConfigService.fetchComposeInfoByInstanceId(testSessionUser, instanceId)
          .tap(() => {
            sinon.assert.calledWith(
              ClusterConfigService._parseComposeInfoForConfig,
              testSessionUser,
              config
            )
          })
      })

      it('should set the config.commit when the repo and branch matches the gitPushInfo ', function () {
        const commit = 'asdasdasdasd'
        return ClusterConfigService.fetchComposeInfoByInstanceId(testSessionUser, instanceId, {
          repo: testData.repo,
          branch: testData.branch,
          commit
        })
          .tap(() => {
            expect(config.commit).to.equal(commit)
          })
      })
      it('should not the config.commit when the repo and branch don\'t match the gitPushInfo ', function () {
        const commit = 'asdasdasdasd'
        return ClusterConfigService.fetchComposeInfoByInstanceId(testSessionUser, instanceId, {
          repo: testData.repo,
          branch: 'sadasdasdasd',
          commit
        })
          .tap(() => {
            expect(testData.commit).to.be.undefined()
          })
      })
    })
  })

  describe('_parseComposeInfoForConfig', function () {
    const filePath = 'config/compose.yml'
    const fileString = 'version: \'2\'\nservices:\n  web:\n    build: \'./src/\'\n    command: [node, index.js]\n    ports:\n      - "5000:5000"\n    environment:\n      - NODE_ENV=development\n      - SHOW=true\n      - HELLO=678\n'
    const orgName = 'runnable'
    const ownerUsername = orgName.toLowerCase()
    const repoName = 'api'
    const repoFullName = orgName + '/' + repoName
    const branchName = 'feature-1'
    const clusterName = 'api-unit'
    const dockerComposeContent = {
      fileString: fileString,
      filePath: filePath,
      fileSha: '13ec49b1014891c7b494126226f95e318e1d3e82',
      repo: repoFullName,
      commitRef: 'asdasdasdsadasdasd'
    }
    const commitSha = 'abcc0b9'
    const branchMock = {
      commit: {
        sha: commitSha
      }
    }
    let testData = {}

    beforeEach(done =>{
      testData = {
        repo: repoFullName,
        branch: branchName,
        clusterName,
        files: [{
          path: filePath,
          sha: dockerComposeContent.fileSha
        }],
        isTesting,
        testReporters,
        parentInputClusterConfigId
      }
      done()
    })

    beforeEach(function (done) {
      sinon.stub(ClusterConfigService, 'fetchFileFromGithub').resolves(dockerComposeContent)
      sinon.stub(GitHub.prototype, 'getBranchAsync').resolves(branchMock)
      sinon.stub(ClusterConfigService, 'parseComposeFileAndPopulateENVs').resolves(testParsedContent)
      done()
    })
    afterEach(function (done) {
      ClusterConfigService.fetchFileFromGithub.restore()
      GitHub.prototype.getBranchAsync.restore()
      ClusterConfigService.parseComposeFileAndPopulateENVs.restore()
      done()
    })
    describe('errors', function () {
      it('should return error if ClusterConfigService.parseComposeFileAndPopulateENVs failed', function (done) {
        const error = new Error('Some error')
        ClusterConfigService.parseComposeFileAndPopulateENVs.throws(error)
        ClusterConfigService._parseComposeInfoForConfig(testSessionUser, testData)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })
    })

    describe('success', function () {
      it('should run successfully', function () {
        return ClusterConfigService._parseComposeInfoForConfig(testSessionUser, testData)
      })

      it('should return a model with clusterOpts and services', function () {
        return ClusterConfigService._parseComposeInfoForConfig(testSessionUser, testData)
          .tap(results => {
            expect(results).to.be.object()
            expect(results.clusterOpts).to.equal(testData)
            expect(results.services).to.equal(testParsedContent.results)
          })
      })

      it('should add files from testParsedContent to clusterOpts', function () {
        return ClusterConfigService._parseComposeInfoForConfig(testSessionUser, testData)
          .tap(results => {
            expect(results.clusterOpts.files).to.equal(testParsedContent.files)
          })
      })

      it('should call getBranchAsync when a commit is not given', function () {
        return ClusterConfigService._parseComposeInfoForConfig(testSessionUser, testData)
          .tap(function () {
            sinon.assert.calledOnce(GitHub.prototype.getBranchAsync)
            sinon.assert.calledWithExactly(GitHub.prototype.getBranchAsync, testData.repo, testData.branch)
          })
      })

      it('should not call getBranchAsync when a commit is given', function () {
        testData.commit = 'asdadasdasdasd'
        return ClusterConfigService._parseComposeInfoForConfig(testSessionUser, testData)
          .tap(function () {
            sinon.assert.notCalled(GitHub.prototype.getBranchAsync)
          })
      })

      it('should call parseComposeFileAndPopulateENVs with commit from testData', function () {
        testData.commit = 'asdadasdasdasd'
        return ClusterConfigService._parseComposeInfoForConfig(testSessionUser, testData)
          .tap(function () {
            sinon.assert.calledOnce(ClusterConfigService.parseComposeFileAndPopulateENVs)
            sinon.assert.calledWithExactly(
              ClusterConfigService.parseComposeFileAndPopulateENVs,
              repoFullName,
              clusterName,
              testSessionUser.bigPoppaUser,
              filePath,
              'asdadasdasdasd'
            )
          })
      })

      it('should call parseComposeFileAndPopulateENVs with commit from branch', function () {
        return ClusterConfigService._parseComposeInfoForConfig(testSessionUser, testData)
          .tap(function () {
            sinon.assert.calledOnce(ClusterConfigService.parseComposeFileAndPopulateENVs)
            sinon.assert.calledWithExactly(
              ClusterConfigService.parseComposeFileAndPopulateENVs,
              repoFullName,
              clusterName,
              testSessionUser.bigPoppaUser,
              filePath,
              commitSha
            )
          })
      })

      it('should call all the functions in the order', function () {
        return ClusterConfigService._parseComposeInfoForConfig(testSessionUser, testData)
          .tap(function () {
            sinon.assert.callOrder(
              GitHub.prototype.getBranchAsync,
              ClusterConfigService.parseComposeFileAndPopulateENVs
            )
          })
      })
    })
  })
  describe('_getInstanceFromServicesByShortName', function () {
    let instancesWithConfigs
    const instance1Name = 'hello'
    const instance1 = {
      name: instance1Name
    }
    const instance2Name = 'goodbye'
    const instance2 = {
      name: instance2Name
    }
    beforeEach(done =>{
      instancesWithConfigs = [
        {
          config: {
            metadata: {
              name: instance1Name
            }
          },
          instance: instance1
        },
        {
          config: {
            metadata: {
              name: instance2Name
            }
          },
          instance: instance2
        }
      ]

      done()
    })
    it('should return instance1', function (done) {
      const instance = ClusterConfigService._getInstanceFromServicesByShortName(instancesWithConfigs, instance1Name)
      expect(instance).to.equal(instance1)
      done()
    })
  })

  describe('getUniqueServicesKeysFromOctobearResults', function () {
    let octobearConfig
    beforeEach(done =>{
      octobearConfig = {
        mains: {
          builds: {
            hello: {
              build: {
                dockerFilePath: '/Dockerfile'
              }
            },
            test: {
              build: {
                dockerFilePath: '/Dockerfile'
              }
            }
          },
          externals: {
            github: {
              repo: 'user/externalRepo'
            },
            anotherTest: {
              repo:  'user/testRepo'
            },
            andAnotherTest: {
              repo:  'user/testRepo'
            }
          }
        }
      }

      done()
    })
    it('should return 1 build, and 2 externals', function (done) {
      const results = ClusterConfigService.getUniqueServicesKeysFromOctobearResults(octobearConfig)
      expect(results.builds.length).to.equal(1)
      expect(results.externals.length).to.equal(2)
      done()
    })
  })
  describe('_uniquePathReduce', function () {
    let octobearConfig
    beforeEach(done =>{
      octobearConfig = {
        mains: {
          externals: {
            github: {
              repo: 'user/externalRepo'
            },
            anotherTest: {
              repo:  'user/testRepo'
            },
            andAnotherTest: {
              repo:  'user/testRepo'
            }
          }
        }
      }

      done()
    })
    it('should return 1 build, and 2 externals', function (done) {
      const results = ClusterConfigService._uniquePathReduce(octobearConfig.mains.externals, 'repo')
      expect(results.length).to.equal(2)
      done()
    })
  })
})
