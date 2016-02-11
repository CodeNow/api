'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach

var api = require('../../fixtures/api-control')
var dock = require('../../fixtures/dock')
var expects = require('../../fixtures/expects')
var multi = require('../../fixtures/multi-factory')
var uuid = require('uuid')
var primus = require('../../fixtures/primus')
var mockGetUserById = require('../../fixtures/mocks/github/getByUserId')

describe('AppCodeVersions - /contexts/:id/versions/:id/appCodeVersions', function () {
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

  beforeEach(
    mockGetUserById.stubBefore(function () {
      var array = [{
        id: 11111,
        username: 'Runnable'
      }]
      if (ctx.user) {
        array.push({
          id: ctx.user.attrs.accounts.github.id,
          username: ctx.user.attrs.accounts.github.username
        })
      }
      if (ctx.moderator) {
        array.push({
          id: ctx.moderator.attrs.accounts.github.id,
          username: ctx.moderator.attrs.accounts.github.username
        })
      }
      if (ctx.nonOwner) {
        array.push({
          id: ctx.nonOwner.attrs.accounts.github.id,
          username: ctx.nonOwner.attrs.accounts.github.username
        })
      }
      return array
    })
  )
  afterEach(mockGetUserById.stubAfter)
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

  describe('DELETE', function () {
    describe('unbuilt', function () {
      beforeEach(function (done) {
        multi.createContextVersion(function (err, contextVersion, context, build, user) {
          if (err) { return done(err) }
          ctx.contextVersion = contextVersion
          ctx.context = context
          ctx.user = user
          ctx.repoName = 'Dat-middleware'
          ctx.fullRepoName = ctx.user.json().accounts.github.login + '/' + ctx.repoName
          require('../../fixtures/mocks/github/repos-username-repo')(ctx.user, ctx.repoName)
          require('../../fixtures/mocks/github/repos-username-repo-hooks')(ctx.user, ctx.repoName)
          var body = {
            repo: ctx.fullRepoName,
            branch: 'master',
            commit: uuid()
          }
          var username = ctx.user.attrs.accounts.github.login
          require('../../fixtures/mocks/github/repos-keys-get')(username, ctx.repoName, true)
          ctx.appCodeVersion = ctx.contextVersion.addGithubRepo(body, done)
        })
      })
      describe('should delete a github repo', function () {
        describe('owner', function () {
          it('should allow', function (done) {
            ctx.appCodeVersion.destroy(expects.success(204, done))
          })
        })
        describe('non-owner', function () {
          beforeEach(createNonOwner)
          it('should fail (403)', function (done) {
            createContextVersion(ctx.nonOwner).destroyAppCodeVersion(ctx.appCodeVersion.id(),
              expects.errorStatus(403, done))
          })
        })
        describe('moderator', function () {
          beforeEach(createModUser)
          it('should allow', function (done) {
            createContextVersion(ctx.moderator).destroyAppCodeVersion(ctx.appCodeVersion.id(),
              expects.success(204, done))
          })
        })
      })
      it('should 404 for non-existant', function (done) {
        ctx.appCodeVersion.destroy('111122223333444455556666', expects.error(404, /AppCodeVersion/, done))
      })
    })
    describe('built version', function () {
      beforeEach(function (done) {
        multi.createContextVersion(function (err, contextVersion, context, build, user) {
          if (err) { return done(err) }
          ctx.user = user
          ctx.repoName = 'Dat-middleware'
          ctx.fullRepoName = ctx.user.json().accounts.github.login + '/' + ctx.repoName
          var body = {
            repo: ctx.fullRepoName,
            branch: 'master',
            commit: uuid()
          }
          require('../../fixtures/mocks/github/repos-username-repo')(ctx.user, ctx.repoName)
          require('../../fixtures/mocks/github/repos-username-repo-hooks')(ctx.user, ctx.repoName)
          var username = ctx.user.attrs.accounts.github.login
          require('../../fixtures/mocks/github/repos-keys-get')(username, ctx.repoName, true)
          ctx.appCodeVersion = contextVersion.addGithubRepo(body, function (err) {
            if (err) { return done(err) }
            multi.buildTheBuild(user, build, function (err) {
              if (err) { return done(err) }
              done()
            })
          })
        })
      })
      it('should not delete the repo', function (done) {
        ctx.appCodeVersion.destroy(expects.error(400, /Cannot/, done))
      })
    })
  })
})
