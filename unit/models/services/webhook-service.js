'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach

var Code = require('code')
var expect = Code.expect
var Promise = require('bluebird')
var sinon = require('sinon')

var WebhookService = require('models/services/webhook-service')
var UserWhitelist = require('models/mongo/user-whitelist')
var User = require('models/mongo/user')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)
require('sinon-as-promised')(Promise)

describe('Webhook Service Unit Tests: ' + moduleName, function () {

  describe('onGithookEvent', function () {
    var username = 'thejsj'
    var githubPushInfo = {
      committer: username
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
        WebhookService.checkCommitterIsRunnableUser(githubPushInfo)
          .asCallback(function (err) {
            expect(err).to.equal(mongoErr)
            sinon.assert.calledOnce(User.findOneAsync)
            sinon.assert.calledWith(User.findOneAsync, {'accounts.github.username': username})
            done()
          })
      })
      it('should respond with 403 if no whitelist found', function (done) {
        User.findOneAsync.resolves()
        WebhookService.checkCommitterIsRunnableUser(githubPushInfo)
          .asCallback(function (err) {
            expect(err.output.statusCode).to.equal(403)
            expect(err.output.payload.message).to.match(/commit.*author.*not.*runnable.*user/i)
            sinon.assert.calledOnce(User.findOneAsync)
            sinon.assert.calledWith(User.findOneAsync, { 'accounts.github.username': 'thejsj' })
            done()
          })
      })
      it('should respond with 403 if username was not specified', function (done) {
        WebhookService.checkCommitterIsRunnableUser({})
          .asCallback(function (err) {
            expect(err.output.statusCode).to.equal(403)
            expect(err.output.payload.message).to.match(/Commit author\/committer username is empty/i)
            sinon.assert.notCalled(User.findOneAsync)
            done()
          })
      })
    })

    it('should next without error if everything worked', function (done) {
      WebhookService.checkCommitterIsRunnableUser(githubPushInfo)
        .then(function () {
          sinon.assert.calledOnce(User.findOneAsync)
          sinon.assert.calledWith(User.findOneAsync, { 'accounts.github.username': username })
        })
        .asCallback(done)
    })
  })

  describe('checkCommitterIsRunnableUser', function () {
    var username = 'thejsj'
    var githubPushInfo = {
      committer: username
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
        WebhookService.checkCommitterIsRunnableUser(githubPushInfo)
          .asCallback(function (err) {
            expect(err).to.equal(mongoErr)
            sinon.assert.calledOnce(User.findOneAsync)
            sinon.assert.calledWith(User.findOneAsync, {'accounts.github.username': username})
            done()
          })
      })
      it('should respond with 403 if no whitelist found', function (done) {
        User.findOneAsync.resolves()
        WebhookService.checkCommitterIsRunnableUser(githubPushInfo)
          .asCallback(function (err) {
            expect(err.output.statusCode).to.equal(403)
            expect(err.output.payload.message).to.match(/commit.*author.*not.*runnable.*user/i)
            sinon.assert.calledOnce(User.findOneAsync)
            sinon.assert.calledWith(User.findOneAsync, { 'accounts.github.username': 'thejsj' })
            done()
          })
      })
      it('should respond with 403 if username was not specified', function (done) {
        WebhookService.checkCommitterIsRunnableUser({})
          .asCallback(function (err) {
            expect(err.output.statusCode).to.equal(403)
            expect(err.output.payload.message).to.match(/Commit author\/committer username is empty/i)
            sinon.assert.notCalled(User.findOneAsync)
            done()
          })
      })
    })

    it('should next without error if everything worked', function (done) {
      WebhookService.checkCommitterIsRunnableUser(githubPushInfo)
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
        committer: {
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

})
