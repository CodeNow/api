'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach

var Code = require('code')
var expect = Code.expect
var sinon = require('sinon')

var githubActions = require('routes/actions/github')
var UserWhitelist = require('models/mongo/user-whitelist')
var User = require('models/mongo/user')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('GitHub Actions: ' + moduleName, function () {
  describe('parseGitHubPushData', function () {
    it('should return error if req.body.repository not found', function (done) {
      var req = {
        body: {}
      }
      var res = {}
      githubActions.parseGitHubPushData(req, res, function (err) {
        expect(err.output.statusCode).to.equal(400)
        expect(err.output.payload.message).to.equal('Unexpected commit hook format. Repository is required')
        done()
      })
    })

    it('should parse headCommit as {} if req.body.head_commit is null', function (done) {
      var req = {
        body: {
          repository: {
            id: 20736018,
            name: 'api',
            full_name: 'CodeNow/api',
            owner: {
              name: 'CodeNow',
              email: 'live@codenow.com'
            },
            private: true
          },
          ref: 'refs/heads/feature-1'
        }
      }
      var res = {}
      githubActions.parseGitHubPushData(req, res, function (err) {
        if (err) { return done(err) }
        expect(req.githubPushInfo.branch).to.equal('feature-1')
        expect(req.githubPushInfo.commitLog.length).to.equal(0)
        expect(Object.keys(req.githubPushInfo.headCommit).length).to.equal(0)
        done()
      })
    })

    it('should return error if req.body.ref not found', function (done) {
      var req = {
        body: {
          repository: 'podviaznikov/hellonode',
          head_commit: {}
        }
      }
      var res = {}
      githubActions.parseGitHubPushData(req, res, function (err) {
        expect(err.output.statusCode).to.equal(400)
        expect(err.output.payload.message).to.equal('Unexpected commit hook format. Ref is required')
        done()
      })
    })

    it('should parse branch and default to [] for commmitLog', function (done) {
      var headCommit = {
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
        added: [

        ],
        removed: [

        ],
        modified: [
          'lib/routes/actions/github.js'
        ]
      }
      var sender = {
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
      var req = {
        body: {
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
      }

      var res = {}
      githubActions.parseGitHubPushData(req, res, function (err) {
        if (err) { return done(err) }
        expect(req.githubPushInfo.branch).to.equal('feature-1')
        expect(req.githubPushInfo.repo).to.equal('CodeNow/api')
        expect(req.githubPushInfo.repoName).to.equal('api')
        expect(req.githubPushInfo.repoOwnerOrgName).to.equal('CodeNow')
        expect(req.githubPushInfo.ref).to.equal(req.body.ref)
        expect(req.githubPushInfo.headCommit).to.equal(headCommit)
        expect(req.githubPushInfo.commit).to.equal(headCommit.id)
        expect(req.githubPushInfo.commitLog.length).to.equal(1)
        expect(req.githubPushInfo.commitLog[0]).to.equal(headCommit)
        expect(req.githubPushInfo.user).to.equal(sender)
        done()
      })
    })
  })

  describe('checkRepoOwnerOrgIsWhitelisted', function () {
    beforeEach(function (done) {
      sinon.stub(UserWhitelist, 'findOne').yieldsAsync(null, { _id: 'some-id' })
      done()
    })
    afterEach(function (done) {
      UserWhitelist.findOne.restore()
      done()
    })

    it('should next with error if db call failed', function (done) {
      var mongoErr = new Error('Mongo error')
      UserWhitelist.findOne.yieldsAsync(mongoErr)
      var req = {
        githubPushInfo: {
          repoOwnerOrgName: 'CodeNow'
        }
      }
      githubActions.checkRepoOwnerOrgIsWhitelisted(req, {}, function (err) {
        expect(err).to.equal(mongoErr)
        sinon.assert.calledOnce(UserWhitelist.findOne)
        sinon.assert.calledWith(UserWhitelist.findOne, { lowerName: 'codenow' })
        done()
      })
    })
    it('should next without error if everything worked', function (done) {
      var req = {
        githubPushInfo: {
          repoOwnerOrgName: 'CodeNow'
        }
      }
      githubActions.checkRepoOwnerOrgIsWhitelisted(req, {}, function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(UserWhitelist.findOne)
        sinon.assert.calledWith(UserWhitelist.findOne, { lowerName: 'codenow' })
        done()
      })
    })
    it('should respond with 403 if no whitelist found', function (done) {
      var req = {
        githubPushInfo: {
          repoOwnerOrgName: 'CodeNow'
        }
      }
      UserWhitelist.findOne.yieldsAsync(null, null)
      var res = {
        status: function (code) {
          return {
            send: function (message) {
              expect(code).to.equal(403)
              expect(message).to.equal('Repo owner is not registered in Runnable')
              sinon.assert.calledOnce(UserWhitelist.findOne)
              sinon.assert.calledWith(UserWhitelist.findOne, { lowerName: 'codenow' })
              done()
            }
          }
        }
      }
      githubActions.checkRepoOwnerOrgIsWhitelisted(req, res, function () {
        throw new Error('Should never happen')
      })
    })
  })

  describe('checkCommitterIsRunnableUser', function () {
    var username = 'thejsj'
    var req = {
      githubPushInfo: {
        committer: username
      }
    }
    beforeEach(function (done) {
      sinon.stub(User, 'findOneByGithubUsername').yieldsAsync(null, { _id: 'some-id' })
      done()
    })
    afterEach(function (done) {
      User.findOneByGithubUsername.restore()
      done()
    })

    it('should next with error if db call failed', function (done) {
      var mongoErr = new Error('Mongo error')
      User.findOneByGithubUsername.yieldsAsync(mongoErr)
      githubActions.checkCommitterIsRunnableUser(req, {}, function (err) {
        expect(err).to.equal(mongoErr)
        sinon.assert.calledOnce(User.findOneByGithubUsername)
        sinon.assert.calledWith(User.findOneByGithubUsername, username)
        expect(err).to.equal(mongoErr)
        done()
      })
    })
    it('should next without error if everything worked', function (done) {
      githubActions.checkCommitterIsRunnableUser(req, {}, function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(User.findOneByGithubUsername)
        sinon.assert.calledWith(User.findOneByGithubUsername, username)
        done()
      })
    })
    it('should respond with 403 if no whitelist found', function (done) {
      User.findOneByGithubUsername.yieldsAsync(null, null)
      var errStub = sinon.stub()
      var callback = function (code, message) {
        expect(code).to.equal(403)
        expect(message).to.match(/commit.*author.*not.*runnable.*user/i)
        sinon.assert.calledOnce(User.findOneByGithubUsername)
        sinon.assert.calledWith(User.findOneByGithubUsername, username)
        done()
      }
      var res = {
        status: function (code) {
          return { send: callback.bind(callback, code) }
        }
      }
      githubActions.checkCommitterIsRunnableUser(req, res, errStub)
    })
    it('should respond with 403 if username wa not specified', function (done) {
      var errStub = sinon.stub()
      var callback = function (code, message) {
        expect(code).to.equal(403)
        expect(message).to.match(/Commit author\/committer username is empty/i)
        sinon.assert.calledOnce(User.findOneByGithubUsername)
        sinon.assert.calledWith(User.findOneByGithubUsername, username)
        done()
      }
      var res = {
        status: function (code) {
          return { send: callback.bind(callback, code) }
        }
      }
      var req = {
        githubPushInfo: {
          committer: null
        }
      }
      githubActions.checkCommitterIsRunnableUser(req, res, errStub)
    })
  })
})
