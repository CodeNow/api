'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach

var Boom = require('dat-middleware').Boom
var Code = require('code')
var expect = Code.expect
var NotImplementedException = require('errors/not-implemented-exception.js')
var ObjectId = require('mongoose').Types.ObjectId
var Promise = require('bluebird')
var sinon = require('sinon')

var BuildService = require('models/services/build-service')
var Instance = require('models/mongo/instance')
var InstanceForkService = require('models/services/instance-fork-service')
var IsolationService = require('models/services/isolation-service')
var MixPanelModel = require('models/apis/mixpanel')
var WebhookService = require('models/services/webhook-service')
var UserWhitelist = require('models/mongo/user-whitelist')
var User = require('models/mongo/user')
var rabbitMQ = require('models/rabbitmq')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)
require('sinon-as-promised')(Promise)

describe('Webhook Service Unit Tests: ' + moduleName, function () {
  describe('autoDelete', function () {
    var githubPushInfo = {
      repo: 'theRepo',
      branch: 'theBranch'
    }

    beforeEach(function (done) {
      sinon.stub(Instance, 'findForkedInstancesAsync')
      sinon.stub(rabbitMQ, 'deleteInstance')
      done()
    })
    afterEach(function (done) {
      Instance.findForkedInstancesAsync.restore()
      rabbitMQ.deleteInstance.restore()
      done()
    })
    describe('validating errors', function () {
      it('should reject when Mongo returns an error', function (done) {
        var mongoErr = new Error('Mongo error')
        Instance.findForkedInstancesAsync.rejects(mongoErr)
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
        Instance.findForkedInstancesAsync.resolves([])
        WebhookService.autoDelete(githubPushInfo)
          .then(function (instances) {
            expect(instances).to.deep.equal([])
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
        Instance.findForkedInstancesAsync.resolves(instances)
        WebhookService.autoDelete(githubPushInfo)
          .then(function (instances) {
            expect(instances).to.deep.equal(['sdasdsaddgfasdfgasdfasdf', 'erfvsdfsavxscvsacfvserw'])
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
      sinon.stub(BuildService, 'createAndBuildContextVersion')
      done()
    })
    afterEach(function (done) {
      BuildService.createAndBuildContextVersion.restore()
      done()
    })
    describe('validating errors', function () {
      it('should reject when createAndBuildContextVersion fails', function (done) {
        var mongoErr = new Error('Mongo error')
        BuildService.createAndBuildContextVersion.rejects(mongoErr)
        WebhookService.autoDeploy(instances, githubPushInfo)
          .asCallback(function (err) {
            expect(err).to.equal(mongoErr)
            done()
          })
      })
    })
    describe('Successful runs', function () {
      it('should skip createAndBuildContextVersion but return successfully when given []', function (done) {
        BuildService.createAndBuildContextVersion.resolves()
        WebhookService.autoDeploy([], githubPushInfo)
          .then(function (instances) {
            expect(instances).to.deep.equal(null)
            sinon.assert.notCalled(BuildService.createAndBuildContextVersion)
          })
          .asCallback(done)
      })
      it('shouldn\'t build  but return successfully when given only locked instances', function (done) {
        instances[0].locked = true
        instances[1].locked = true
        BuildService.createAndBuildContextVersion.resolves()
        WebhookService.autoDeploy(instances, githubPushInfo)
          .then(function (instances) {
            expect(instances).to.deep.equal(null)
            sinon.assert.notCalled(BuildService.createAndBuildContextVersion)
          })
          .asCallback(done)
      })
      it('should skip createAndBuildContextVersion on an instance that is locked', function (done) {
        instances[0].locked = true
        BuildService.createAndBuildContextVersion.resolves()
        WebhookService.autoDeploy(instances, githubPushInfo)
          .then(function () {
            sinon.assert.calledOnce(BuildService.createAndBuildContextVersion)
            sinon.assert.neverCalledWith(BuildService.createAndBuildContextVersion, {
              locked: true,
              instanceId: 'sdasdsaddgfasdfgasdfasdf'
            })
            sinon.assert.calledWith(
              BuildService.createAndBuildContextVersion,
              { _id: 'erfvsdfsavxscvsacfvserw' },
              githubPushInfo,
              'autodeploy'
            )
          })
          .asCallback(done)
      })
      it('should createAndBuildContextVersion for each instance', function (done) {
        BuildService.createAndBuildContextVersion.resolves()
        WebhookService.autoDeploy(instances, githubPushInfo)
          .then(function () {
            sinon.assert.calledTwice(BuildService.createAndBuildContextVersion)
            sinon.assert.calledWith(
              BuildService.createAndBuildContextVersion,
              { _id: 'sdasdsaddgfasdfgasdfasdf' },
              githubPushInfo,
              'autodeploy'
            )
            sinon.assert.calledWith(
              BuildService.createAndBuildContextVersion,
              { _id: 'erfvsdfsavxscvsacfvserw' },
              githubPushInfo,
              'autodeploy'
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
      sinon.stub(InstanceForkService, 'autoFork')
      sinon.stub(IsolationService, 'autoIsolate')
      done()
    })
    afterEach(function (done) {
      WebhookService.checkCommitPusherIsRunnableUser.restore()
      Instance.findMasterPodsToAutoFork.restore()
      InstanceForkService.autoFork.restore()
      IsolationService.autoIsolate.restore()
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
            sinon.assert.calledWith(
              IsolationService.autoIsolate,
              forkedInstances,
              githubPushInfo
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
            expect(err.output.statusCode).to.equal(403)
            expect(err.output.payload.message).to.match(/commit.*author.*not.*runnable.*user/i)
            sinon.assert.calledOnce(User.findOneAsync)
            sinon.assert.calledWith(User.findOneAsync, { 'accounts.github.username': 'thejsj' })
            done()
          })
      })
      it('should respond with 403 if username was not specified', function (done) {
        WebhookService.checkCommitPusherIsRunnableUser({})
          .asCallback(function (err) {
            expect(err.output.statusCode).to.equal(403)
            expect(err.output.payload.message).to.match(/Commit author\/committer username is empty/i)
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
  })

  describe('checkRepoOrganizationAgainstWhitelist', function () {
    var githubPushInfo = {
      repoOwnerOrgName: 'CodeNow'
    }

    beforeEach(function (done) {
      sinon.stub(UserWhitelist, 'findOneAsync').resolves({ _id: 'some-id', allowed: true })
      done()
    })
    afterEach(function (done) {
      UserWhitelist.findOneAsync.restore()
      done()
    })

    describe('validating errors', function () {
      it('should next with error if db call failed', function (done) {
        var mongoErr = new Error('Mongo error')
        UserWhitelist.findOneAsync.rejects(mongoErr)

        WebhookService.checkRepoOrganizationAgainstWhitelist(githubPushInfo)
          .asCallback(function (err) {
            expect(err).to.equal(mongoErr)
            sinon.assert.calledOnce(UserWhitelist.findOneAsync)
            sinon.assert.calledWith(UserWhitelist.findOneAsync, { lowerName: 'codenow' })
            done()
          })
      })
      it('should respond with 403 if no whitelist found', function (done) {
        UserWhitelist.findOneAsync.resolves()
        WebhookService.checkRepoOrganizationAgainstWhitelist(githubPushInfo)
          .asCallback(function (err) {
            expect(err.output.statusCode).to.equal(403)
            expect(err.output.payload.message).to.match(/not registered/)
            sinon.assert.calledOnce(UserWhitelist.findOneAsync)
            sinon.assert.calledWith(UserWhitelist.findOneAsync, { lowerName: 'codenow' })
            done()
          })
      })
      it('should respond with 403 if not allowed', function (done) {
        UserWhitelist.findOneAsync.resolves({ allowed: false })
        WebhookService.checkRepoOrganizationAgainstWhitelist(githubPushInfo)
          .asCallback(function (err) {
            expect(err.output.statusCode).to.equal(403)
            expect(err.output.payload.message).to.match(/suspended/)
            sinon.assert.calledOnce(UserWhitelist.findOneAsync)
            sinon.assert.calledWith(UserWhitelist.findOneAsync, { lowerName: 'codenow' })
            done()
          })
      })
    })
    it('should continue without error if everything worked', function (done) {
      WebhookService.checkRepoOrganizationAgainstWhitelist(githubPushInfo)
        .then(function () {
          sinon.assert.calledOnce(UserWhitelist.findOneAsync)
          sinon.assert.calledWith(UserWhitelist.findOneAsync, { lowerName: 'codenow' })
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
            name: 'CodeNow',
            email: 'live@codenow.com'
          },
          private: true
        }
      }
      done()
    })
    describe('validating errors', function () {
      it('should return error if body.repository not found', function (done) {
        WebhookService.parseGitHubPushData({})
          .asCallback(function (err) {
            expect(err.output.statusCode).to.equal(400)
            expect(err.output.payload.message).to.equal('Unexpected commit hook format. Repository is required')
            done()
          })
      })
      it('should return error if body.ref is not found', function (done) {
        delete body.ref
        WebhookService.parseGitHubPushData(body)
          .asCallback(function (err) {
            expect(err.output.statusCode).to.equal(400)
            expect(err.output.payload.message).to.equal('Unexpected commit hook format. Ref is required')
            done()
          })
      })
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
            expect(err).to.deep.equal(
              new NotImplementedException('processGithookEvent', 'Cannot handle tags\' related events')
            )
            done()
          })
      })
      it('should reject when parseGitHubPushData fails with error', function (done) {
        var error = Boom.badRequest('dfasdfdsaf')
        WebhookService.parseGitHubPushData.rejects(error)
        WebhookService.checkRepoOrganizationAgainstWhitelist.resolves()
        WebhookService.processGithookEvent(payload)
          .asCallback(function (err) {
            expect(err).to.equal(error)
            done()
          })
      })
      it('should reject when checkRepoOrganizationAgainstWhitelist fails with error', function (done) {
        var error = Boom.forbidden('dfasdfdsaf')
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
