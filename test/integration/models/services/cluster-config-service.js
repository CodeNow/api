'use strict'

const Lab = require('lab')
const lab = exports.lab = Lab.script()
const describe = lab.describe
const it = lab.it
const before = lab.before
const beforeEach = lab.beforeEach
const after = lab.after
const afterEach = lab.afterEach
const rabbitMQ = require('models/rabbitmq')
const sinon = require('sinon')
const Instance = require('models/mongo/instance')
require('sinon-as-promised')(require('bluebird'))

const AutoIsolationConfig = require('models/mongo/auto-isolation-config')
const ClusterConfigService = require('models/services/cluster-config-service')
const InputClusterConfig = require('models/mongo/input-cluster-config')
const mongoFactory = require('../../fixtures/factory')
const mongooseControl = require('models/mongo/mongoose-control.js')

describe('Cluster Config Services Integration Tests', function () {
  before(mongooseControl.start)
  beforeEach(require('../../../functional/fixtures/clean-mongo').removeEverything)
  afterEach(require('../../../functional/fixtures/clean-mongo').removeEverything)
  after(mongooseControl.stop)
  const clusterName = 'CLUSTER'
  let mockInstance
  let mockBuild
  let mockCv
  let mockSessionUser
  let depInstance
  let testMainParsedContent
  let testDepParsedContent
  let githubPushInfo
  let mockAutoConfig
  let mockClusterConfig
  const ownerId = 11111
  const bigPoppaId = 123
  const bigPoppaOrgId = 1

  beforeEach(function (done) {
    rabbitMQ.connect().asCallback(done)
  })
  afterEach(function (done) {
    rabbitMQ.disconnect().asCallback(done)
  })
  describe('updating a cluster', function () {
    beforeEach(function (done) {
      mockSessionUser = {
        gravatar: 'sdasdasdasdasdasd',
        accounts: {
          github: {
            id: ownerId,
            username: 'owner'
          }
        },
        bigPoppaUser: {
          id: bigPoppaId,
          organizations: [{
            lowerName: 'codenow'
          }]
        }
      }
      githubPushInfo = {
        'repo': 'CodeNow\/node-starter',
        'repoName': 'node-starter',
        'repoOwnerOrgName': 'CodeNow',
        'branch': 'master',
        'commit': 'a79c490506589487a3cfffdf15984f1e905dd40c',
        'commitPusher': 'Nathan219',
        'commitLog': [{
          'id': 'a79c490506589487a3cfffdf15984f1e905dd40c',
          'tree_id': '8e11c9164377b6810b73f11df265b8385bfa5ac9',
          'distinct': true,
          'message': 'Update docker-compose.yml',
          'timestamp': '2017-01-20T14:17:55-08:00',
          'url': 'https:\/\/github.com\/CodeNow\/node-starter\/commit\/a79c490506589487a3cfffdf15984f1e905dd40c',
          'author': {
            'name': 'Nathan Meyers',
            'email': 'nathan@runnable.com',
            'username': 'Nathan219'
          },
          'committer': {
            'name': 'GitHub',
            'email': 'noreply@github.com',
            'username': 'web-flow'
          },
          'added': [],
          'removed': [],
          'modified': [
            'docker-compose.yml'
          ]
        }],
        'user': {
          'login': 'Nathan219',
          'id': 6379413,
          'avatar_url': 'https:\/\/avatars.githubusercontent.com\/u\/6379413?v=3',
          'gravatar_id': '',
          'url': 'https:\/\/api.github.com\/users\/Nathan219',
          'html_url': 'https:\/\/github.com\/Nathan219',
          'followers_url': 'https:\/\/api.github.com\/users\/Nathan219\/followers',
          'following_url': 'https:\/\/api.github.com\/users\/Nathan219\/following{\/other_user}',
          'gists_url': 'https:\/\/api.github.com\/users\/Nathan219\/gists{\/gist_id}',
          'starred_url': 'https:\/\/api.github.com\/users\/Nathan219\/starred{\/owner}{\/repo}',
          'subscriptions_url': 'https:\/\/api.github.com\/users\/Nathan219\/subscriptions',
          'organizations_url': 'https:\/\/api.github.com\/users\/Nathan219\/orgs',
          'repos_url': 'https:\/\/api.github.com\/users\/Nathan219\/repos',
          'events_url': 'https:\/\/api.github.com\/users\/Nathan219\/events{\/privacy}',
          'received_events_url': 'https:\/\/api.github.com\/users\/Nathan219\/received_events',
          'type': 'User',
          'site_admin': false
        }
      }
      done()
    })
    beforeEach(function (done) {
      mongoFactory.createInstanceWithProps(mockSessionUser, {
        name: 'api',
        masterPod: true
      }, function (err, instance, build, cv) {
        if (err) {
          return done(err)
        }
        mockInstance = instance
        mockBuild = build
        mockCv = cv
        testMainParsedContent = {
          metadata: {
            name: instance.name,
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
            name: instance.name,
            containerStartCommand: 'npm start',
            ports: [80],
            env: ['HELLO=WORLD']
          }
        }
        done()
      })
    })
    beforeEach(function (done) {
      mongoFactory.createInstanceWithProps(mockSessionUser, {
        masterPod: true
      }, function (err, instance) {
        if (err) {
          return done(err)
        }
        depInstance = instance
        testDepParsedContent = {
          metadata: {
            name: instance.name,
            isMain: false
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
            name: instance.name,
            containerStartCommand: 'npm start-workers',
            ports: [80],
            env: ['HELLO=WORLD']
          }
        }
        done()
      })
    })
    beforeEach(function (done) {
      AutoIsolationConfig.createAsync({
          instance: mockInstance._id,
          requestedDependencies: [{ instance: depInstance._id }],
          createdByUser: bigPoppaId,
          ownedByOrg: bigPoppaOrgId,
          redeployOnKilled: true
        })
        .then((config) => {
          mockAutoConfig = config
        })
        .asCallback(done)
    })
    beforeEach(function (done) {
      InputClusterConfig.createAsync({
          autoIsolationConfigId: mockAutoConfig._id,
          filePath: '/docker-compose.yml',
          fileSha: 'asdasdasfasdfasdfsadfadsf3rfsadfasdfsdf',
          createdByUser: bigPoppaId,
          ownedByOrg: bigPoppaOrgId,
          clusterName: clusterName
        })
        .then((config) => {
          mockClusterConfig = config
        })
        .asCallback(done)
    })
    beforeEach(function (done) {
      sinon.stub(rabbitMQ, 'deleteInstance').resolves()
      sinon.stub(rabbitMQ, 'createInstanceContainer').resolves()
      sinon.stub(rabbitMQ, 'instanceDeployed').resolves()
      sinon.spy(rabbitMQ, 'autoDeployInstance')
      sinon.stub(Instance.prototype, 'emitInstanceUpdateAsync').resolves()
      done()
    })
    afterEach(function (done) {
      rabbitMQ.deleteInstance.restore()
      rabbitMQ.createInstanceContainer.restore()
      rabbitMQ.instanceDeployed.restore()
      rabbitMQ.autoDeployInstance.restore()
      Instance.prototype.emitInstanceUpdateAsync.restore()
      done()
    })
    it('should finish successfully', function (done) {
      const octobearInfo = [testMainParsedContent, testDepParsedContent]
      ClusterConfigService.updateCluster(mockSessionUser, mockInstance, githubPushInfo, octobearInfo)
        .asCallback(done)
    })
    it('should have created an autoDeploy job', function (done) {
      const octobearInfo = [testMainParsedContent, testDepParsedContent]
      ClusterConfigService.updateCluster(mockSessionUser, mockInstance, githubPushInfo, octobearInfo)
        .then(() => {
          sinon.assert.calledOnce(rabbitMQ.autoDeployInstance)
        })
        .asCallback(done)
    })
    it('should delete the dependent', function (done) {
      const octobearInfo = [testMainParsedContent]
      ClusterConfigService.updateCluster(mockSessionUser, mockInstance, githubPushInfo, octobearInfo)
        .then(() => {
          sinon.assert.calledOnce(rabbitMQ.deleteInstance)
        })
        .asCallback(done)
    })
  })
})
