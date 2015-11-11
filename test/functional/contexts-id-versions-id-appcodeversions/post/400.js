'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after

var api = require('../../fixtures/api-control')
var multi = require('../../fixtures/multi-factory')
var typesTests = require('../../fixtures/types-test-util')

describe('400 POST /contexts/:id/versions/:id/appCodeVersions', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  before(require('../../fixtures/mocks/api-client').setup)
  after(api.stop.bind(ctx))
  after(require('../../fixtures/mocks/api-client').clean)

  beforeEach(function (done) {
    multi.createContextVersion(function (err, contextVersion, context, build, user) {
      ctx.contextVersion = contextVersion
      ctx.context = context
      ctx.user = user
      ctx.repoName = 'Dat-middleware'
      ctx.fullRepoName = ctx.user.attrs.accounts.github.login + '/' + ctx.repoName
      require('../../fixtures/mocks/github/repos-username-repo')(ctx.user, ctx.repoName)
      require('../../fixtures/mocks/github/repos-username-repo-hooks')(ctx.user, ctx.repoName)
      done(err)
    })
  })

  describe('invalid types', function () {
    var def = {
      action: 'create an appversion',
      requiredParams: [
        {
          name: 'repo',
          type: 'repo-string'
        },
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
      ctx.contextVersion.addGithubRepo(body, cb)
    })
  })
})
