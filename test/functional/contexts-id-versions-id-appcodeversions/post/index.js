'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect
var find = require('101/find')

var api = require('../../fixtures/api-control')
var dock = require('../../fixtures/dock')
var expects = require('../../fixtures/expects')
var multi = require('../../fixtures/multi-factory')
var uuid = require('uuid')
var primus = require('../../fixtures/primus')

describe('XXX POST /contexts/:id/versions/:id/appCodeVersions', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  before(dock.start.bind(ctx))
  beforeEach(primus.connect)
  afterEach(primus.disconnect)
  after(api.stop.bind(ctx))
  after(dock.stop.bind(ctx))
  afterEach(require('../../fixtures/clean-mongo').removeEverything)
  afterEach(require('../../fixtures/clean-ctx')(ctx))
  afterEach(require('../../fixtures/clean-nock'))

  function createModUser (done) {
    ctx.moderator = multi.createModerator(function (err) {
      require('../../fixtures/mocks/github/user-orgs')(ctx.moderator) // non owner org
      done(err)
    })
  }
  function createNonOwner (done) {
    ctx.nonOwner = multi.createUser(function (err) {
      require('../../fixtures/mocks/github/user-orgs')(ctx.nonOwner) // non owner org
      done(err)
    })
  }
  function createContextVersion (user) {
    return user
      .newContext(ctx.context.id()).newVersion(ctx.contextVersion.id())
  }

  describe('unbuilt', function () {
    beforeEach(function (done) {
      multi.createContextVersion(function (err, contextVersion, context, build, user) {
        ctx.contextVersion = contextVersion
        ctx.mainAppCodeVersion = contextVersion.attrs.appCodeVersions[0]
        ctx.context = context
        ctx.user = user
        ctx.repoName = 'Dat-middleware'
        ctx.fullRepoName = ctx.user.attrs.accounts.github.login + '/' + ctx.repoName
        require('../../fixtures/mocks/github/repos-username-repo')(ctx.user, ctx.repoName)
        require('../../fixtures/mocks/github/repos-username-repo-hooks')(ctx.user, ctx.repoName)
        done(err)
      })
    })
    describe('should add a github repo', function () {
      describe('as owner', function () {
        it('should allow', function (done) {
          var body = {
            repo: ctx.fullRepoName,
            branch: 'master',
            commit: uuid()
          }
          var expected = {
            repo: ctx.fullRepoName,
            branch: 'master',
            commit: body.commit,
            defaultBranch: 'master'
          }
          var username = ctx.user.attrs.accounts.github.login
          require('../../fixtures/mocks/github/repos-hooks-get')(username, ctx.repoName)
          require('../../fixtures/mocks/github/repos-hooks-post')(username, ctx.repoName)
          require('../../fixtures/mocks/github/repos-keys-get')(username, ctx.repoName, true)
          ctx.contextVersion.addGithubRepo(body, expects.success(201, expected, done))
        })
      })
      describe('as non-owner', function () {
        beforeEach(createNonOwner)
        it('should fail (403)', function (done) {
          var body = {
            repo: ctx.fullRepoName
          }
          createContextVersion(ctx.nonOwner).addGithubRepo(body, expects.errorStatus(403, done))
        })
      })
      describe('as moderator', function () {
        beforeEach(createModUser)
        it('should allow', function (done) {
          var body = {
            repo: ctx.fullRepoName,
            branch: 'master',
            commit: uuid()
          }
          var expected = {
            repo: ctx.fullRepoName,
            branch: 'master',
            commit: body.commit
          }
          var username = ctx.user.attrs.accounts.github.login
          require('../../fixtures/mocks/github/repos-hooks-get')(username, ctx.repoName)
          require('../../fixtures/mocks/github/repos-hooks-post')(username, ctx.repoName)
          require('../../fixtures/mocks/github/repos-keys-get')(username, ctx.repoName, true)
          createContextVersion(ctx.moderator).addGithubRepo(body,
            expects.success(201, expected, done))
        })
      })
    })
    it('should not add a repo the second time', function (done) {
      var body = {
        repo: ctx.fullRepoName,
        branch: 'master',
        commit: uuid()
      }
      var expected = {
        repo: ctx.fullRepoName,
        branch: 'master',
        commit: body.commit
      }
      var username = ctx.user.attrs.accounts.github.login
      require('../../fixtures/mocks/github/repos-hooks-get')(username, ctx.repoName)
      require('../../fixtures/mocks/github/repos-hooks-post')(username, ctx.repoName)
      require('../../fixtures/mocks/github/repos-keys-get')(username, ctx.repoName, true)
      ctx.contextVersion.addGithubRepo(body, expects.success(201, expected, function (err) {
        if (err) { return done(err) }
        ctx.contextVersion.addGithubRepo(body, expects.error(409, /already added/, done))
      }))
    })
    it('should save additionalRepo', function (done) {
      var body = {
        repo: ctx.fullRepoName,
        branch: 'master',
        commit: uuid(),
        additionalRepo: true
      }
      var expected = {
        repo: ctx.fullRepoName,
        branch: 'master',
        commit: body.commit,
        additionalRepo: true
      }
      var username = ctx.user.attrs.accounts.github.login
      require('../../fixtures/mocks/github/repos-hooks-get')(username, ctx.repoName)
      require('../../fixtures/mocks/github/repos-hooks-post')(username, ctx.repoName)
      require('../../fixtures/mocks/github/repos-keys-get')(username, ctx.repoName, true)
      ctx.contextVersion.addGithubRepo(body, expects.success(201, expected, function (err) {
        if (err) { return done(err) }
        ctx.contextVersion.fetch(function (err, cv) {
          if (err) { return done(err) }
          expect(cv.appCodeVersions.length).to.equal(2)
          expect(find(cv.appCodeVersions, function (appCodeVersion) {
            return !!appCodeVersion.additionalRepo
          })).to.deep.contain(expected)
          expect(find(cv.appCodeVersions, function (appCodeVersion) {
            return !appCodeVersion.additionalRepo
          })).to.deep.contain(ctx.mainAppCodeVersion)
          done()
        })
      }))
    })
  })
})
