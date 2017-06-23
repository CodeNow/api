'use strict'

const Lab = require('lab')
const lab = exports.lab = Lab.script()
const describe = lab.describe
const it = lab.it
const beforeEach = lab.beforeEach
const afterEach = lab.afterEach

const Code = require('code')
const errors = require('errors')
const expect = Code.expect
const ObjectId = require('mongoose').Types.ObjectId
const Promise = require('bluebird')
const sinon = require('sinon')

const BuildService = require('models/services/build-service')
const ClusterConfigService = require('models/services/cluster-config-service')
const ClusterBuildService = require('models/services/cluster-build-service')
const Instance = require('models/mongo/instance')
const InstanceForkService = require('models/services/instance-fork-service')
const IsolationService = require('models/services/isolation-service')
const MixPanelModel = require('models/apis/mixpanel')
const WebhookService = require('models/services/webhook-service')
const OrganizationService = require('models/services/organization-service')
const User = require('models/mongo/user')
const rabbitMQ = require('models/rabbitmq')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

require('sinon-as-promised')(Promise)

describe('Webhook Service Unit Tests', function () {
  describe('autoDelete', function () {
    var githubPushInfo = {
      repo: 'theRepo',
      branch: 'theBranch'
    }

    beforeEach(function (done) {
      sinon.stub(Instance, 'findNonIsolatedForkedInstances')
      sinon.stub(rabbitMQ, 'deleteInstance')
      done()
    })
    afterEach(function (done) {
      Instance.findNonIsolatedForkedInstances.restore()
      rabbitMQ.deleteInstance.restore()
      done()
    })
    describe('validating errors', function () {
      it('should reject when Mongo returns an error', function (done) {
        var mongoErr = new Error('Mongo error')
        Instance.findNonIsolatedForkedInstances.rejects(mongoErr)
        WebhookService.autoDelete(githubPushInfo)
          .asCallback(function (err) {
            expect(err).to.equal(mongoErr)
            sinon.assert.notCalled(rabbitMQ.deleteInstance)
            done()
          })
      })
    })
    describe('Successful runs', function () {
      it('should return empty array, and not delete anything, when fetch returns empty', function (done) {
        Instance.findNonIsolatedForkedInstances.resolves([])
        WebhookService.autoDelete(githubPushInfo)
          .then(function (instances) {
            expect(instances).to.equal([])
            sinon.assert.notCalled(rabbitMQ.deleteInstance)
          })
          .asCallback(done)
      })
      it('should return array of instance ids deleted, and should call delete twice', function (done) {
        var instances = [{
          _id: 'sdasdsaddgfasdfgasdfasdf'
        }, {
          _id: 'erfvsdfsavxscvsacfvserw'
        }]
        Instance.findNonIsolatedForkedInstances.resolves(instances)
        WebhookService.autoDelete(githubPushInfo)
          .then(function (instances) {
            expect(instances).to.equal(['sdasdsaddgfasdfgasdfasdf', 'erfvsdfsavxscvsacfvserw'])
            sinon.assert.calledTwice(rabbitMQ.deleteInstance)
            sinon.assert.calledWith(rabbitMQ.deleteInstance, {
              instanceId: 'sdasdsaddgfasdfgasdfasdf'
            })
            sinon.assert.calledWith(rabbitMQ.deleteInstance, {
              instanceId: 'erfvsdfsavxscvsacfvserw'
            })
          })
          .asCallback(done)
      })
    })
  })

  describe('autoDeploy', function () {
    var githubPushInfo = {
      repo: 'theRepo',
      branch: 'theBranch'
    }
    var instances
    beforeEach(function (done) {
      instances = [{
        _id: 'sdasdsaddgfasdfgasdfasdf'
      }, {
        _id: 'erfvsdfsavxscvsacfvserw'
      }]
      sinon.stub(WebhookService, 'updateComposeOrAutoDeploy').resolves()
      done()
    })
    afterEach(function (done) {
      WebhookService.updateComposeOrAutoDeploy.restore()
      done()
    })
    describe('Successful runs', function () {
      it('should skip createAndBuildContextVersion but return successfully when given []', function (done) {
        WebhookService.updateComposeOrAutoDeploy.resolves({
          hello: 'asdfasdfdsa'
        })
        WebhookService.autoDeploy([], githubPushInfo)
          .then(function (results) {
            expect(results).to.equal([])
            sinon.assert.notCalled(WebhookService.updateComposeOrAutoDeploy)
          })
          .asCallback(done)
      })
      it('shouldn\'t build  but return successfully when given only locked instances', function (done) {
        instances[0].locked = true
        instances[1].locked = true
        WebhookService.updateComposeOrAutoDeploy.resolves({
          hello: 'asdfasdfdsa'
        })
        WebhookService.autoDeploy(instances, githubPushInfo)
          .then(function (results) {
            expect(results).to.equal([])
            sinon.assert.notCalled(WebhookService.updateComposeOrAutoDeploy)
          })
          .asCallback(done)
      })
      it('should skip createAndBuildContextVersion on an instance that is locked', function (done) {
        instances[0].locked = true
        WebhookService.updateComposeOrAutoDeploy.resolves({
          hello: 'asdfasdfdsa'
        })
        WebhookService.autoDeploy(instances, githubPushInfo)
          .then(function (results) {
            expect(results).to.equal([{
              hello: 'asdfasdfdsa'
            }])
            sinon.assert.calledOnce(WebhookService.updateComposeOrAutoDeploy)
            sinon.assert.neverCalledWith(WebhookService.updateComposeOrAutoDeploy,
              instances[0],
              githubPushInfo
            )
            sinon.assert.calledWith(
              WebhookService.updateComposeOrAutoDeploy,
              instances[1],
              githubPushInfo
            )
          })
          .asCallback(done)
      })
      it('should createAndBuildContextVersion for each instance', function (done) {
        WebhookService.updateComposeOrAutoDeploy.resolves()
        WebhookService.autoDeploy(instances, githubPushInfo)
          .then(function () {
            sinon.assert.calledTwice(WebhookService.updateComposeOrAutoDeploy)
            sinon.assert.calledWith(
              WebhookService.updateComposeOrAutoDeploy,
              instances[0],
              githubPushInfo
            )
            sinon.assert.calledWith(
              WebhookService.updateComposeOrAutoDeploy,
              instances[1],
              githubPushInfo
            )
          })
          .asCallback(done)
      })
    })
  })

  describe('updateComposeOrAutoDeploy', function () {
    var githubPushInfo = {
      repo: 'theRepo',
      branch: 'theBranch'
    }
    var instance
    beforeEach(function (done) {
      instance = {
        _id: 'sdasdsaddgfasdfgasdfasdf'
      }
      sinon.stub(BuildService, 'createAndBuildContextVersion')
      sinon.stub(ClusterBuildService, 'create').resolves({
        _id: 'cluster-build-id-1'
      })
      sinon.stub(ClusterConfigService, 'checkIfComposeFilesChanged').rejects(new Error())
      sinon.stub(rabbitMQ, 'updateCluster').resolves()
      done()
    })
    afterEach(function (done) {
      ClusterBuildService.create.restore()
      BuildService.createAndBuildContextVersion.restore()
      ClusterConfigService.checkIfComposeFilesChanged.restore()
      rabbitMQ.updateCluster.restore()
      done()
    })
    describe('validating errors', function () {
      it('should reject when createAndBuildContextVersion fails', function (done) {
        var mongoErr = new Error('Mongo error')
        BuildService.createAndBuildContextVersion.rejects(mongoErr)
        WebhookService.updateComposeOrAutoDeploy(instance, githubPushInfo)
          .asCallback(function (err) {
            expect(err).to.equal(mongoErr)
            done()
          })
      })
    })
    describe('Successful runs', function () {
      it('should createAndBuildContextVersion for each instance', function (done) {
        BuildService.createAndBuildContextVersion.resolves()
        WebhookService.updateComposeOrAutoDeploy(instance, githubPushInfo)
          .then(function () {
            sinon.assert.calledOnce(BuildService.createAndBuildContextVersion)
            sinon.assert.calledWith(
              BuildService.createAndBuildContextVersion,
              { _id: 'sdasdsaddgfasdfgasdfasdf' },
              githubPushInfo,
              'autodeploy'
            )
          })
          .asCallback(done)
      })
      it('should checkIfComposeFilesChanged for each instance', function (done) {
        WebhookService.updateComposeOrAutoDeploy(instance, githubPushInfo)
          .then(function () {
            sinon.assert.calledOnce(ClusterConfigService.checkIfComposeFilesChanged)
          })
          .asCallback(done)
      })
      it('should updateCluster for instance that resolves checkIfComposeFilesChanged', function (done) {
        ClusterConfigService.checkIfComposeFilesChanged.resolves()
        WebhookService.updateComposeOrAutoDeploy(instance, githubPushInfo)
          .then(function () {
            sinon.assert.calledOnce(ClusterBuildService.create)
            sinon.assert.calledOnce(rabbitMQ.updateCluster)
            sinon.assert.calledWith(
              rabbitMQ.updateCluster, {
                instanceId: 'sdasdsaddgfasdfgasdfasdf',
                pushInfo: githubPushInfo
              }
            )
          })
          .asCallback(done)
      })
    })
  })

  describe('autoFork', function () {
    var githubPushInfo = {
      repo: 'theRepo',
      branch: 'theBranch'
    }
    var instances
    var contextIds
    beforeEach(function (done) {
      instances = [{
        _id: 'sdasdsaddgfasdfgasdfasdf'
      }, {
        _id: 'erfvsdfsavxscvsacfvserw'
      }]
      contextIds = ['sadsadasdsad', 'sdgfddfsgdfsgsdfgdsfg']
      sinon.stub(WebhookService, 'checkCommitPusherIsRunnableUser')
      sinon.stub(Instance, 'findMasterPodsToAutoFork')
      sinon.stub(ClusterConfigService, 'checkIfComposeFilesChanged').resolves()
      sinon.stub(InstanceForkService, 'autoFork')
      sinon.stub(IsolationService, 'autoIsolate')
      sinon.stub(rabbitMQ, 'updateCluster').resolves
      done()
    })
    afterEach(function (done) {
      WebhookService.checkCommitPusherIsRunnableUser.restore()
      Instance.findMasterPodsToAutoFork.restore()
      ClusterConfigService.checkIfComposeFilesChanged.restore()
      InstanceForkService.autoFork.restore()
      IsolationService.autoIsolate.restore()
      rabbitMQ.updateCluster.restore()
      done()
    })
    describe('validating errors', function () {
      it('should reject when checkCommitPusherIsRunnableUser fails', function (done) {
        var userError = new Error('User is bad')
        WebhookService.checkCommitPusherIsRunnableUser.rejects(userError)
        WebhookService.autoFork(contextIds, githubPushInfo)
          .asCallback(function (err) {
            expect(err).to.equal(userError)
            done()
          })
      })
      it('should reject if findMasterPodsToAutoFork fails', function (done) {
        var error = new Error('User is bad')
        WebhookService.checkCommitPusherIsRunnableUser.resolves()
        Instance.findMasterPodsToAutoFork.rejects(error)
        WebhookService.autoFork(contextIds, githubPushInfo)
          .asCallback(function (err) {
            expect(err).to.equal(error)
            done()
          })
      })
      it('should reject if autoFork fails', function (done) {
        var error = new Error('User is bad')
        WebhookService.checkCommitPusherIsRunnableUser.resolves()
        Instance.findMasterPodsToAutoFork.resolves(instances)
        InstanceForkService.autoFork.rejects(error)
        WebhookService.autoFork(contextIds, githubPushInfo)
          .asCallback(function (err) {
            expect(err).to.equal(error)
            done()
          })
      })
      it('should reject if autoIsolate fails', function (done) {
        var error = new Error('User is bad')
        WebhookService.checkCommitPusherIsRunnableUser.resolves()
        Instance.findMasterPodsToAutoFork.resolves(instances)
        InstanceForkService.autoFork.resolves(instances)
        IsolationService.autoIsolate.rejects(error)
        WebhookService.autoFork(contextIds, githubPushInfo)
          .asCallback(function (err) {
            expect(err).to.equal(error)
            done()
          })
      })
    })
    describe('Successful runs', function () {
      var forkedInstances
      beforeEach(function (done) {
        forkedInstances = [{
          _id: 'sdasdsaddgfasdfgasdfasdf'
        }, {
          _id: 'erfvsdfsavxscvsacfvserw'
        }]
        done()
      })
      it('should skip autoFork when instance fetch returns null, then return null', function (done) {
        WebhookService.checkCommitPusherIsRunnableUser.resolves()
        Instance.findMasterPodsToAutoFork.resolves([])
        InstanceForkService.autoFork.resolves([])
        WebhookService.autoFork(contextIds, githubPushInfo)
          .then(function (instances) {
            expect(instances).to.equal(null)
            sinon.assert.notCalled(InstanceForkService.autoFork)
          })
          .asCallback(done)
      })
      it('should fetch the MasterPods with repo, branch, and contextIds', function (done) {
        WebhookService.checkCommitPusherIsRunnableUser.resolves()
        Instance.findMasterPodsToAutoFork.resolves(instances)
        InstanceForkService.autoFork.resolves(forkedInstances)
        IsolationService.autoIsolate.resolves()
        WebhookService.autoFork(contextIds, githubPushInfo)
          .then(function () {
            sinon.assert.calledWith(
              Instance.findMasterPodsToAutoFork,
              githubPushInfo.repo,
              githubPushInfo.branch,
              contextIds
            )
          })
          .asCallback(done)
      })
      it('should attempt to autoFork all instances returned from findMasterPodsToAutoFork', function (done) {
        WebhookService.checkCommitPusherIsRunnableUser.resolves()
        Instance.findMasterPodsToAutoFork.resolves(instances)
        InstanceForkService.autoFork.resolves(forkedInstances)
        IsolationService.autoIsolate.resolves()
        WebhookService.autoFork(contextIds, githubPushInfo)
          .then(function () {
            sinon.assert.calledOnce(InstanceForkService.autoFork)
            sinon.assert.calledWith(
              InstanceForkService.autoFork,
              instances,
              githubPushInfo
            )
          })
          .asCallback(done)
      })
      it('should autoIsolate the new forked instances from autoFork, and return the forked instances', function (done) {
        WebhookService.checkCommitPusherIsRunnableUser.resolves()
        Instance.findMasterPodsToAutoFork.resolves(instances)
        InstanceForkService.autoFork.resolves(forkedInstances)
        IsolationService.autoIsolate.resolves()
        WebhookService.autoFork(contextIds, githubPushInfo)
          .then(function (instances) {
            expect(instances).to.equal(forkedInstances)
            sinon.assert.calledOnce(IsolationService.autoIsolate)
            sinon.assert.calledWithExactly(
              IsolationService.autoIsolate,
              forkedInstances,
              githubPushInfo
            )
          })
          .asCallback(done)
      })
      it('should check the compose file for each instance', function (done) {
        WebhookService.checkCommitPusherIsRunnableUser.resolves()
        Instance.findMasterPodsToAutoFork.resolves(instances)
        InstanceForkService.autoFork.resolves(forkedInstances)
        IsolationService.autoIsolate.resolves()
        WebhookService.autoFork(contextIds, githubPushInfo)
          .then(function (instances) {
            expect(instances).to.equal(forkedInstances)
            sinon.assert.calledTwice(ClusterConfigService.checkIfComposeFilesChanged)
            sinon.assert.calledWithExactly(
              ClusterConfigService.checkIfComposeFilesChanged,
              forkedInstances[0],
              githubPushInfo
            )
            sinon.assert.calledWithExactly(
              ClusterConfigService.checkIfComposeFilesChanged,
              forkedInstances[1],
              githubPushInfo
            )
          })
          .asCallback(done)
      })
      it('should create cluster update jobs', function (done) {
        WebhookService.checkCommitPusherIsRunnableUser.resolves()
        Instance.findMasterPodsToAutoFork.resolves(instances)
        InstanceForkService.autoFork.resolves(forkedInstances)
        IsolationService.autoIsolate.resolves()
        WebhookService.autoFork(contextIds, githubPushInfo)
          .then(function (instances) {
            expect(instances).to.equal(forkedInstances)
            sinon.assert.calledTwice(rabbitMQ.updateCluster)
            sinon.assert.calledWithExactly(
              rabbitMQ.updateCluster,
              {
                instanceId: forkedInstances[0]._id.toString(),
                pushInfo: githubPushInfo
              }
            )
            sinon.assert.calledWithExactly(
              rabbitMQ.updateCluster,
              {
                instanceId: forkedInstances[1]._id.toString(),
                pushInfo: githubPushInfo
              }
            )
          })
          .asCallback(done)
      })
    })
  })

  describe('checkCommitPusherIsRunnableUser', function () {
    var username = 'thejsj'
    var githubPushInfo = {
      commitPusher: username
    }
    beforeEach(function (done) {
      sinon.stub(User, 'findOneAsync').resolves({ _id: 'some-id', allowed: true })
      done()
    })
    afterEach(function (done) {
      User.findOneAsync.restore()
      done()
    })
    describe('validating errors', function () {
      it('should next with error if db call failed', function (done) {
        var mongoErr = new Error('Mongo error')
        User.findOneAsync.rejects(mongoErr)
        WebhookService.checkCommitPusherIsRunnableUser(githubPushInfo)
          .asCallback(function (err) {
            expect(err).to.equal(mongoErr)
            sinon.assert.calledOnce(User.findOneAsync)
            sinon.assert.calledWith(User.findOneAsync, {'accounts.github.username': username})
            done()
          })
      })
      it('should respond with 403 if no whitelist found', function (done) {
        User.findOneAsync.resolves()
        WebhookService.checkCommitPusherIsRunnableUser(githubPushInfo)
          .asCallback(function (err) {
            expect(err.message).to.match(/committer.*not.*runnable.*user/i)
            sinon.assert.calledOnce(User.findOneAsync)
            sinon.assert.calledWith(User.findOneAsync, { 'accounts.github.username': 'thejsj' })
            done()
          })
      })
      it('should respond with 403 if username was not specified', function (done) {
        WebhookService.checkCommitPusherIsRunnableUser({})
          .asCallback(function (err) {
            expect(err.message).to.match(/committer.*username is empty/i)
            sinon.assert.notCalled(User.findOneAsync)
            done()
          })
      })
    })

    it('should next without error if everything worked', function (done) {
      WebhookService.checkCommitPusherIsRunnableUser(githubPushInfo)
        .then(function () {
          sinon.assert.calledOnce(User.findOneAsync)
          sinon.assert.calledWith(User.findOneAsync, { 'accounts.github.username': username })
        })
        .asCallback(done)
    })

    it('should next if repo is public', function (done) {
      const newInfo = Object.assign({}, githubPushInfo, {
        repository: {
          private: false
        }
      })
      WebhookService.checkCommitPusherIsRunnableUser(newInfo)
        .then(function () {
          sinon.assert.notCalled(User.findOneAsync)
        })
        .asCallback(done)
    })
  })

  describe('checkRepoOrganizationAgainstWhitelist', function () {
    var githubPushInfo = {
      repoOwnerOrgName: 'Runnable'
    }

    beforeEach(function (done) {
      sinon.stub(OrganizationService, 'getByGithubUsername').resolves({ id: 23423, allowed: true })
      done()
    })
    afterEach(function (done) {
      OrganizationService.getByGithubUsername.restore()
      done()
    })

    describe('validating errors', function () {
      it('should next with error if big-poppa call failed', function (done) {
        var superErr = new Error('Something happened!')
        OrganizationService.getByGithubUsername.rejects(superErr)

        WebhookService.checkRepoOrganizationAgainstWhitelist(githubPushInfo)
          .asCallback(function (err) {
            expect(err).to.equal(superErr)
            sinon.assert.calledOnce(OrganizationService.getByGithubUsername)
            sinon.assert.calledWith(OrganizationService.getByGithubUsername, 'Runnable')
            done()
          })
      })
      it('should respond with 403 if no whitelist found', function (done) {
        var error = new errors.OrganizationNotFoundError()
        OrganizationService.getByGithubUsername.rejects(error)
        WebhookService.checkRepoOrganizationAgainstWhitelist(githubPushInfo)
          .asCallback(function (err) {
            expect(err.message).to.match(/not registered/)
            sinon.assert.calledOnce(OrganizationService.getByGithubUsername)
            sinon.assert.calledWith(OrganizationService.getByGithubUsername, 'Runnable')
            done()
          })
      })
      it('should respond with 403 if not allowed', function (done) {
        OrganizationService.getByGithubUsername.resolves({ allowed: false })
        WebhookService.checkRepoOrganizationAgainstWhitelist(githubPushInfo)
          .asCallback(function (err) {
            expect(err.message).to.match(/suspended/)
            sinon.assert.calledOnce(OrganizationService.getByGithubUsername)
            sinon.assert.calledWith(OrganizationService.getByGithubUsername, 'Runnable')
            done()
          })
      })
    })
    it('should continue without error if everything worked', function (done) {
      WebhookService.checkRepoOrganizationAgainstWhitelist(githubPushInfo)
        .then(function () {
          sinon.assert.calledOnce(OrganizationService.getByGithubUsername)
          sinon.assert.calledWith(OrganizationService.getByGithubUsername, 'Runnable')
        })
        .asCallback(done)
    })
  })

  describe('doAutoDeployAndAutoFork', function () {
    var githubPushInfo = {
      repo: 'theRepo',
      branch: 'theBranch'
    }
    var instances
    var contextId1 = new ObjectId()
    var contextId2 = new ObjectId()
    beforeEach(function (done) {
      instances = [{
        _id: 'sdasdsaddgfasdfgasdfasdf',
        contextVersion: {
          context: contextId1
        }
      }, {
        _id: 'erfvsdfsavxscvsacfvserw',
        contextVersion: {
          context: contextId2
        }
      }]
      sinon.stub(Instance, 'findInstancesLinkedToBranchAsync')
      sinon.stub(WebhookService, 'autoDeploy')
      sinon.stub(WebhookService, 'autoFork')
      done()
    })
    afterEach(function (done) {
      Instance.findInstancesLinkedToBranchAsync.restore()
      WebhookService.autoDeploy.restore()
      WebhookService.autoFork.restore()
      done()
    })
    describe('env', function () {
      beforeEach(function (done) {
        delete process.env.ENABLE_AUTOFORK_ON_BRANCH_PUSH
        done()
      })
      afterEach(function (done) {
        process.env.ENABLE_AUTOFORK_ON_BRANCH_PUSH = true
        done()
      })
      it('should not attempt to autoFork when ENABLE_AUTOFORK_ON_BRANCH_PUSH is false', function (done) {
        Instance.findInstancesLinkedToBranchAsync.resolves(instances)
        WebhookService.autoDeploy.resolves()
        WebhookService.autoFork.resolves()
        WebhookService.doAutoDeployAndAutoFork(githubPushInfo)
          .asCallback(function () {
            sinon.assert.called(WebhookService.autoDeploy)
            sinon.assert.notCalled(WebhookService.autoFork)
            done()
          })
      })
    })
    describe('validating errors', function () {
      it('should reject when findInstancesLinkedToBranchAsync fails', function (done) {
        var mongoErr = new Error('Mongo error')
        Instance.findInstancesLinkedToBranchAsync.rejects(mongoErr)
        WebhookService.autoDeploy.resolves()
        WebhookService.autoFork.resolves()
        WebhookService.doAutoDeployAndAutoFork(githubPushInfo)
          .asCallback(function (err) {
            expect(err).to.equal(mongoErr)
            done()
          })
      })
      it('should reject when autoDeploy fails', function (done) {
        var mongoErr = new Error('Mongo error')
        Instance.findInstancesLinkedToBranchAsync.resolves(instances)
        WebhookService.autoDeploy.rejects(mongoErr)
        WebhookService.autoFork.resolves()
        WebhookService.doAutoDeployAndAutoFork(githubPushInfo)
          .asCallback(function (err) {
            expect(err).to.equal(mongoErr)
            done()
          })
      })
      it('should reject when autoFork fails', function (done) {
        var mongoErr = new Error('Mongo error')
        Instance.findInstancesLinkedToBranchAsync.resolves(instances)
        WebhookService.autoDeploy.resolves()
        WebhookService.autoFork.rejects(mongoErr)
        WebhookService.doAutoDeployAndAutoFork(githubPushInfo)
          .asCallback(function (err) {
            expect(err).to.equal(mongoErr)
            done()
          })
      })
    })
    describe('Successful runs', function () {
      it('should call both autoFork and AutoDeploy with the instances and githubPushInfo', function (done) {
        instances.push(instances[0])
        Instance.findInstancesLinkedToBranchAsync.resolves(instances)
        WebhookService.autoDeploy.resolves()
        WebhookService.autoFork.resolves()
        WebhookService.doAutoDeployAndAutoFork(githubPushInfo)
          .then(function () {
            sinon.assert.calledWith(WebhookService.autoDeploy, instances, githubPushInfo)
            sinon.assert.calledWith(
              WebhookService.autoFork,
              instances,
              githubPushInfo
            )
          })
          .asCallback(done)
      })
    })
  })

  describe('parseGitHubPushData', function () {
    var body
    var headCommit
    var sender
    beforeEach(function (done) {
      headCommit = {
        id: '77485a1a3c2fcf1a6db52e72bf1c05f40336d244',
        distinct: true,
        message: 'add whitelist check back to hooks',
        timestamp: '2016-01-20T14:40:39-08:00',
        url: 'https://github.com/CodeNow/api/commit/77485a1a3c2fcf1a6db52e72bf1c05f40336d244',
        author: {
          name: 'Anton Podviaznikov',
          email: 'podviaznikov@gmail.com',
          username: 'podviaznikov'
        },
        commitPusher: {
          name: 'Anton Podviaznikov',
          email: 'podviaznikov@gmail.com',
          username: 'podviaznikov'
        },
        added: [],
        removed: [],
        modified: [
          'lib/routes/actions/github.js'
        ]
      }
      sender = {
        login: 'podviaznikov',
        id: 429706,
        avatar_url: 'https://avatars.githubusercontent.com/u/429706?v=3',
        gravatar_id: '',
        url: 'https://api.github.com/users/podviaznikov',
        html_url: 'https://github.com/podviaznikov',
        followers_url: 'https://api.github.com/users/podviaznikov/followers',
        following_url: 'https://api.github.com/users/podviaznikov/following{/other_user}',
        gists_url: 'https://api.github.com/users/podviaznikov/gists{/gist_id}',
        starred_url: 'https://api.github.com/users/podviaznikov/starred{/owner}{/repo}',
        subscriptions_url: 'https://api.github.com/users/podviaznikov/subscriptions',
        organizations_url: 'https://api.github.com/users/podviaznikov/orgs',
        repos_url: 'https://api.github.com/users/podviaznikov/repos',
        events_url: 'https://api.github.com/users/podviaznikov/events{/privacy}',
        received_events_url: 'https://api.github.com/users/podviaznikov/received_events',
        type: 'User',
        site_admin: false
      }
      body = {
        ref: 'refs/heads/feature-1',
        head_commit: headCommit,
        commits: [headCommit],
        sender: sender,
        repository: {
          id: 20736018,
          name: 'api',
          full_name: 'CodeNow/api',
          owner: {
            id: 890,
            name: 'CodeNow',
            email: 'live@codenow.com'
          },
          private: true
        }
      }
      done()
    })
    it('should parse branch and default to [] for commmitLog', function (done) {
      WebhookService.parseGitHubPushData(body)
        .then(function (githubPushInfo) {
          expect(githubPushInfo.branch).to.equal('feature-1')
          expect(githubPushInfo.repo).to.equal('CodeNow/api')
          expect(githubPushInfo.repoName).to.equal('api')
          expect(githubPushInfo.repoOwnerOrgName).to.equal('CodeNow')
          expect(githubPushInfo.ref).to.equal(body.ref)
          expect(githubPushInfo.commit).to.equal(headCommit.id)
          expect(githubPushInfo.commitLog.length).to.equal(1)
          expect(githubPushInfo.commitLog[0]).to.equal(headCommit)
          expect(githubPushInfo.user).to.equal(sender)
        })
        .asCallback(done)
    })
  })

  describe('parseGitHubPullRequestData', function () {
    var body
    var sender
    let committer = "hello"
    beforeEach(function (done) {
      sender = {
        login: 'podviaznikov',
        id: 429706,
        avatar_url: 'https://avatars.githubusercontent.com/u/429706?v=3',
        gravatar_id: '',
        url: 'https://api.github.com/users/podviaznikov',
        html_url: 'https://github.com/podviaznikov',
        followers_url: 'https://api.github.com/users/podviaznikov/followers',
        following_url: 'https://api.github.com/users/podviaznikov/following{/other_user}',
        gists_url: 'https://api.github.com/users/podviaznikov/gists{/gist_id}',
        starred_url: 'https://api.github.com/users/podviaznikov/starred{/owner}{/repo}',
        subscriptions_url: 'https://api.github.com/users/podviaznikov/subscriptions',
        organizations_url: 'https://api.github.com/users/podviaznikov/orgs',
        repos_url: 'https://api.github.com/users/podviaznikov/repos',
        events_url: 'https://api.github.com/users/podviaznikov/events{/privacy}',
        received_events_url: 'https://api.github.com/users/podviaznikov/received_events',
        type: 'User',
        site_admin: false
      }
      body = {
        head_commit: {
          id: "63f69a4d399cca74263e9c45169dc3553c66b52d",
          tree_id: "b6a67d6587e144ba91519d1f8043556f8c144920",
          distinct: true,
          message: "is correct user",
          timestamp: "2017-03-21T12:05:48-07:00",
          url: "123",
          committer: {
            name: 'dude',
            email: "something@nothing.com",
            username: committer
          }
        },
        number: 777,
        pull_request: {
          head: {
            label: 'myorg:mybranch',
            sha: '77485a1a3c2fcf1a6db52e72bf1c05f40336d244'
          }
        },
        sender: sender,
        repository: {
          id: 20736018,
          name: 'api',
          full_name: 'CodeNow/api',
          owner: {
            id: 890,
            name: 'CodeNow',
            email: 'live@codenow.com'
          },
          private: true
        }
      }
      done()
    })
    it('should parse data', function (done) {
      WebhookService.parseGitHubPullRequestData(body)
        .then(function (githubPushInfo) {
          expect(githubPushInfo.branch).to.equal('myorg:mybranch')
          expect(githubPushInfo.pullRequest).to.equal(777)
          expect(githubPushInfo.repo).to.equal('CodeNow/api')
          expect(githubPushInfo.repoName).to.equal('api')
          expect(githubPushInfo.repoOwnerOrgName).to.equal('CodeNow')
          expect(githubPushInfo.commit).to.equal(body.pull_request.head.sha)
          expect(githubPushInfo.commitLog.length).to.equal(0)
          expect(githubPushInfo.user).to.equal(sender)
        })
        .asCallback(done)
    })
    it('should parse name from committer', function (done) {
      WebhookService.parseGitHubPullRequestData(body)
        .then(function (githubPushInfo) {
          expect(githubPushInfo.commitPusher).to.equal(committer)
        })
        .asCallback(done)
    })
    it('should parse name from pusher', function (done) {
      delete body.head_commit.committer
      WebhookService.parseGitHubPullRequestData(body)
        .then(function (githubPushInfo) {
          expect(githubPushInfo.commitPusher).to.equal(sender.login)
        })
        .asCallback(done)
    })
  })

  describe('shouldHandlePullRequestEvent', function () {
    it('should return false if head and base are the same', function (done) {
      const result = WebhookService.shouldHandlePullRequestEvent({
        pull_request: {
          head: {
            repo: { id: 1 }
          },
          base: {
            repo: { id: 1 }
          }
        }
      })
      expect(result).to.be.false()
      done()
    })

    it('should return true if head and base are the same', function (done) {
      const result = WebhookService.shouldHandlePullRequestEvent({
        pull_request: {
          head: {
            repo: { id: 1 }
          },
          base: {
            repo: { id: 2 }
          }
        }
      })
      expect(result).to.be.true()
      done()
    })
  })
  describe('processGithookPullRequestOpened', function () {
    beforeEach(function (done) {
      sinon.stub(WebhookService, '_processGithookPullRequestEvent').resolves()
      done()
    })
    afterEach(function (done) {
      WebhookService._processGithookPullRequestEvent.restore()
      done()
    })
    it('should call _processGithookPullRequestEvent', function (done) {
      const payload = {
        number: 777
      }
      WebhookService.processGithookPullRequestOpened(payload)
      .asCallback(function () {
        sinon.assert.calledOnce(WebhookService._processGithookPullRequestEvent)
        sinon.assert.calledWith(WebhookService._processGithookPullRequestEvent, payload, WebhookService.autoFork)
        done()
      })
    })
  })
  describe('processGithookPullRequestSynced', function () {
    beforeEach(function (done) {
      sinon.stub(WebhookService, '_processGithookPullRequestEvent').resolves()
      done()
    })
    afterEach(function (done) {
      WebhookService._processGithookPullRequestEvent.restore()
      done()
    })
    it('should call _processGithookPullRequestEvent', function (done) {
      const payload = {
        number: 777
      }
      WebhookService.processGithookPullRequestSynced(payload)
      .asCallback(function () {
        sinon.assert.calledOnce(WebhookService._processGithookPullRequestEvent)
        sinon.assert.calledWith(WebhookService._processGithookPullRequestEvent, payload, WebhookService.autoDeploy)
        done()
      })
    })
  })
  describe('_processGithookPullRequestEvent', function () {
    let body
    let sender
    let parsedData = {
      repo: 'CodeNow/api',
      branch: 'myorg:mybranch'
    }
    const instances = [
      {
        _id: 1
      }
    ]
    beforeEach(function (done) {
      sender = {
        login: 'podviaznikov',
        id: 429706,
        avatar_url: 'https://avatars.githubusercontent.com/u/429706?v=3',
        gravatar_id: '',
        url: 'https://api.github.com/users/podviaznikov',
        html_url: 'https://github.com/podviaznikov',
        followers_url: 'https://api.github.com/users/podviaznikov/followers',
        following_url: 'https://api.github.com/users/podviaznikov/following{/other_user}',
        gists_url: 'https://api.github.com/users/podviaznikov/gists{/gist_id}',
        starred_url: 'https://api.github.com/users/podviaznikov/starred{/owner}{/repo}',
        subscriptions_url: 'https://api.github.com/users/podviaznikov/subscriptions',
        organizations_url: 'https://api.github.com/users/podviaznikov/orgs',
        repos_url: 'https://api.github.com/users/podviaznikov/repos',
        events_url: 'https://api.github.com/users/podviaznikov/events{/privacy}',
        received_events_url: 'https://api.github.com/users/podviaznikov/received_events',
        type: 'User',
        site_admin: false
      }
      body = {
        number: 777,
        pull_request: {
          head: {
            label: 'myorg:mybranch',
            sha: '77485a1a3c2fcf1a6db52e72bf1c05f40336d244'
          }
        },
        sender: sender,
        repository: {
          id: 20736018,
          name: 'api',
          full_name: 'CodeNow/api',
          owner: {
            id: 890,
            name: 'CodeNow',
            email: 'live@codenow.com'
          },
          private: true
        }
      }
      sinon.stub(WebhookService, 'shouldHandlePullRequestEvent').returns(true)
      sinon.stub(WebhookService, 'parseGitHubPullRequestData').resolves(parsedData)
      sinon.stub(WebhookService, 'checkRepoOrganizationAgainstWhitelist').resolves()
      sinon.stub(WebhookService, 'reportMixpanelUserPush').resolves()
      sinon.stub(Instance, 'findInstancesLinkedToBranchAsync').resolves(instances)
      sinon.stub(WebhookService, 'autoFork').resolves([])
      done()
    })
    afterEach(function (done) {
      WebhookService.shouldHandlePullRequestEvent.restore()
      WebhookService.parseGitHubPullRequestData.restore()
      WebhookService.checkRepoOrganizationAgainstWhitelist.restore()
      WebhookService.reportMixpanelUserPush.restore()
      Instance.findInstancesLinkedToBranchAsync.restore()
      WebhookService.autoFork.restore()
      done()
    })
    it('should not call anything if shouldHandlePullRequestEvent return false', function (done) {
      WebhookService.shouldHandlePullRequestEvent.returns(false)
      WebhookService._processGithookPullRequestEvent(body, WebhookService.autoFork)
      .asCallback(function () {
        sinon.assert.notCalled(WebhookService.parseGitHubPullRequestData)
        done()
      })
    })
    it('should call parseGitHubPullRequestData', function (done) {
      WebhookService._processGithookPullRequestEvent(body, WebhookService.autoFork)
      .asCallback(function () {
        sinon.assert.calledOnce(WebhookService.parseGitHubPullRequestData)
        sinon.assert.calledWithExactly(WebhookService.parseGitHubPullRequestData, body)
        done()
      })
    })
    it('should call checkRepoOrganizationAgainstWhitelist', function (done) {
      WebhookService._processGithookPullRequestEvent(body, WebhookService.autoFork)
      .asCallback(function () {
        sinon.assert.calledOnce(WebhookService.checkRepoOrganizationAgainstWhitelist)
        sinon.assert.calledWithExactly(WebhookService.checkRepoOrganizationAgainstWhitelist, parsedData)
        done()
      })
    })
    it('should call reportMixpanelUserPush', function (done) {
      WebhookService._processGithookPullRequestEvent(body, WebhookService.autoFork)
      .asCallback(function () {
        sinon.assert.calledOnce(WebhookService.reportMixpanelUserPush)
        sinon.assert.calledWithExactly(WebhookService.reportMixpanelUserPush, parsedData)
        done()
      })
    })
    it('should call findInstancesLinkedToBranchAsync', function (done) {
      WebhookService._processGithookPullRequestEvent(body, WebhookService.autoFork)
      .asCallback(function () {
        sinon.assert.calledOnce(Instance.findInstancesLinkedToBranchAsync)
        sinon.assert.calledWithExactly(Instance.findInstancesLinkedToBranchAsync, parsedData.repo, parsedData.branch)
        done()
      })
    })
    it('should call autoFork', function (done) {
      WebhookService._processGithookPullRequestEvent(body, WebhookService.autoFork)
      .asCallback(function () {
        sinon.assert.calledOnce(WebhookService.autoFork)
        sinon.assert.calledWithExactly(WebhookService.autoFork, instances, parsedData)
        done()
      })
    })
    it('should call in order', function (done) {
      WebhookService._processGithookPullRequestEvent(body, WebhookService.autoFork)
      .asCallback(function () {
        sinon.assert.callOrder(
          WebhookService.parseGitHubPullRequestData,
          WebhookService.checkRepoOrganizationAgainstWhitelist,
          WebhookService.reportMixpanelUserPush,
          Instance.findInstancesLinkedToBranchAsync,
          WebhookService.autoFork
        )
        done()
      })
    })
    describe('errors', function () {
      it('should return error if parseGitHubPullRequestData faled', function (done) {
        const error = new Error('My error')
        WebhookService.parseGitHubPullRequestData.rejects(error)
        WebhookService._processGithookPullRequestEvent(body, WebhookService.autoFork)
        .asCallback(function (err) {
          expect(err.message).to.equal(error.message)
          done()
        })
      })
      it('should return error if reportMixpanelUserPush faled', function (done) {
        const error = new Error('My error')
        WebhookService.reportMixpanelUserPush.rejects(error)
        WebhookService._processGithookPullRequestEvent(body, WebhookService.autoFork)
        .asCallback(function (err) {
          expect(err.message).to.equal(error.message)
          done()
        })
      })
      it('should return error if findInstancesLinkedToBranchAsync faled', function (done) {
        const error = new Error('My error')
        Instance.findInstancesLinkedToBranchAsync.rejects(error)
        WebhookService._processGithookPullRequestEvent(body, WebhookService.autoFork)
        .asCallback(function (err) {
          expect(err.message).to.equal(error.message)
          done()
        })
      })
      it('should return error if autoFork faled', function (done) {
        const error = new Error('My error')
        WebhookService.autoFork.rejects(error)
        WebhookService._processGithookPullRequestEvent(body, WebhookService.autoFork)
        .asCallback(function (err) {
          expect(err.message).to.equal(error.message)
          done()
        })
      })
    })
  })
  describe('processGithookEvent', function () {
    var githubPushInfo
    var payload

    beforeEach(function (done) {
      payload = {}
      githubPushInfo = {
        user: {
          id: 'adsfsdfasdfsdfasdf'
        }
      }
      sinon.stub(WebhookService, 'parseGitHubPushData')
      sinon.stub(WebhookService, 'checkRepoOrganizationAgainstWhitelist')
      sinon.stub(WebhookService, 'reportMixpanelUserPush')
      sinon.stub(WebhookService, 'autoDelete')
      sinon.stub(WebhookService, 'doAutoDeployAndAutoFork')
      done()
    })
    afterEach(function (done) {
      WebhookService.parseGitHubPushData.restore()
      WebhookService.checkRepoOrganizationAgainstWhitelist.restore()
      WebhookService.reportMixpanelUserPush.restore()
      WebhookService.autoDelete.restore()
      WebhookService.doAutoDeployAndAutoFork.restore()
      done()
    })
    describe('validating errors', function () {
      it('should reject with NotImplementedException when ref has tags', function (done) {
        githubPushInfo.ref = 'refs/tags/'
        WebhookService.parseGitHubPushData.resolves(githubPushInfo)
        WebhookService.checkRepoOrganizationAgainstWhitelist.resolves()
        WebhookService.reportMixpanelUserPush.resolves()
        WebhookService.processGithookEvent(payload)
          .asCallback(function (err) {
            expect(err).to.be.an.instanceof(WorkerStopError)
            done()
          })
      })
      it('should reject when parseGitHubPushData fails with error', function (done) {
        var error = new Error('dfasdfdsaf')
        WebhookService.parseGitHubPushData.rejects(error)
        WebhookService.checkRepoOrganizationAgainstWhitelist.resolves()
        WebhookService.processGithookEvent(payload)
          .asCallback(function (err) {
            expect(err).to.equal(error)
            done()
          })
      })
      it('should reject when checkRepoOrganizationAgainstWhitelist fails with error', function (done) {
        var error = new Error('dfasdfdsaf')
        WebhookService.parseGitHubPushData.resolves(githubPushInfo)
        WebhookService.checkRepoOrganizationAgainstWhitelist.rejects(error)
        WebhookService.processGithookEvent(payload)
          .asCallback(function (err) {
            expect(err).to.equal(error)
            done()
          })
      })
      it('should reject when autoDelete fails with error', function (done) {
        var error = new Error('dfasdfdsaf')
        payload = {
          deleted: true
        }
        WebhookService.parseGitHubPushData.resolves(githubPushInfo)
        WebhookService.checkRepoOrganizationAgainstWhitelist.resolves()
        WebhookService.reportMixpanelUserPush.resolves()
        WebhookService.autoDelete.rejects(error)
        WebhookService.doAutoDeployAndAutoFork.resolves()
        WebhookService.processGithookEvent(payload)
          .asCallback(function (err) {
            expect(err).to.equal(error)
            done()
          })
      })
      it('should reject when doAutoDeployAndAutoFork fails with error', function (done) {
        var error = new Error('dfasdfdsaf')
        WebhookService.parseGitHubPushData.resolves(githubPushInfo)
        WebhookService.checkRepoOrganizationAgainstWhitelist.resolves()
        WebhookService.reportMixpanelUserPush.resolves()
        WebhookService.doAutoDeployAndAutoFork.rejects(error)
        WebhookService.autoDelete.resolves()
        WebhookService.processGithookEvent(payload)
          .asCallback(function (err) {
            expect(err).to.equal(error)
            done()
          })
      })
    })
    describe('Successful Runs', function () {
      it('should run autoDelete when deleted in payload', function (done) {
        payload.deleted = true
        var instanceIds = ['asdsad', 'asdasdsadsa']
        WebhookService.parseGitHubPushData.resolves(githubPushInfo)
        WebhookService.checkRepoOrganizationAgainstWhitelist.resolves()
        WebhookService.reportMixpanelUserPush.resolves()
        WebhookService.autoDelete.resolves(instanceIds)
        WebhookService.processGithookEvent(payload)
          .then(function (result) {
            expect(result).to.equal(instanceIds)
          })
          .asCallback(done)
      })
      it('should run doAutoDeployAndAutoFork when deleted not in payload', function (done) {
        var instanceIds = ['asdsad', 'asdasdsadsa']
        WebhookService.parseGitHubPushData.resolves(githubPushInfo)
        WebhookService.checkRepoOrganizationAgainstWhitelist.resolves()
        WebhookService.reportMixpanelUserPush.resolves()
        WebhookService.doAutoDeployAndAutoFork.resolves(instanceIds)
        WebhookService.processGithookEvent(payload)
          .then(function (result) {
            expect(result).to.equal(instanceIds)
          })
          .asCallback(done)
      })
    })
  })

  describe('reportMixpanelUserPush', function () {
    var user
    var githubPushInfo
    beforeEach(function (done) {
      githubPushInfo = {
        user: {
          id: 'adsfsdfasdfsdfasdf'
        }
      }
      user = {
        id: 'adsfsdfasdfsdfasdf'
      }
      sinon.stub(User, 'findByGithubIdAsync')
      sinon.stub(MixPanelModel.prototype, 'track')
      done()
    })
    afterEach(function (done) {
      User.findByGithubIdAsync.restore()
      MixPanelModel.prototype.track.restore()
      done()
    })
    describe('validating errors', function () {
      it('should not reject when Mongo returns an error, and shouldn\'t call track', function (done) {
        var mongoErr = new Error('Mongo error')
        User.findByGithubIdAsync.rejects(mongoErr)
        WebhookService.reportMixpanelUserPush(githubPushInfo)
          .then(function () {
            sinon.assert.notCalled(MixPanelModel.prototype.track)
          })
          .asCallback(done)
      })
    })
    describe('Successful runs', function () {
      it('should fetch user, and send tracking info', function (done) {
        User.findByGithubIdAsync.resolves(user)
        WebhookService.reportMixpanelUserPush(githubPushInfo)
          .then(function () {
            sinon.assert.calledWith(MixPanelModel.prototype.track, 'github-push', githubPushInfo)
          })
          .asCallback(done)
      })
      it('should not track user if user not in database', function (done) {
        User.findByGithubIdAsync.resolves()
        WebhookService.reportMixpanelUserPush(githubPushInfo)
          .then(function () {
            sinon.assert.neverCalledWith(MixPanelModel.prototype.track, 'github-push', githubPushInfo)
          })
          .asCallback(done)
      })
    })
  })
})
