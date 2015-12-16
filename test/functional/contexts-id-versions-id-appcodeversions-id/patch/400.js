'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach
var expects = require('../../fixtures/expects')

var api = require('../../fixtures/api-control')
var dock = require('../../fixtures/dock')
var multi = require('../../fixtures/multi-factory')
var typesTests = require('../../fixtures/types-test-util')
var uuid = require('uuid')
var primus = require('../../fixtures/primus')
var mockGetUserById = require('../../fixtures/mocks/github/getByUserId')

describe('400 PATCH /contexts/:id/versions/:id/appCodeVersions/:id', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  before(require('../../fixtures/mocks/api-client').setup)
  beforeEach(primus.connect)
  afterEach(primus.disconnect)
  after(api.stop.bind(ctx))
  after(require('../../fixtures/mocks/api-client').clean)
  beforeEach(
    mockGetUserById.stubBefore(function () {
      return [{
        id: ctx.user.attrs.accounts.github.id,
        username: ctx.user.attrs.accounts.github.username
      }]
    })
  )

  afterEach(mockGetUserById.stubAfter)
  beforeEach(function (done) {
    multi.createContextVersion(function (err, contextVersion, context, build, user) {
      if (err) { return done(err) }
      ctx.contextVersion = contextVersion
      ctx.context = context
      ctx.user = user
      ctx.build = build
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

  describe('invalid types', function () {
    var def = {
      action: 'update an appversion',
      requiredParams: [
        {
          name: 'branch',
          type: 'string'
        },
        {
          name: 'commit',
          type: 'string'
        }
      ]
    }
    typesTests.makeTestFromDef(def, ctx, lab, function (body, cb) {
      ctx.appCodeVersion.update(body, cb)
    })
  })

  describe('built version', function () {
    before(dock.start.bind(ctx))
    after(dock.stop.bind(ctx))
    beforeEach(function (done) {
      multi.buildTheBuild(ctx.user, ctx.build, done)
    })
    it('should not add the repo', function (done) {
      var data = {
        repo: 'tjmehta/101',
        branch: 'master',
        commit: uuid()
      }
      ctx.contextVersion.addGithubRepo(data, expects.error(400, /Cannot/, done))
    })
  })
})
