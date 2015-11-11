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

describe('200 PATCH /contexts/:id/versions/:id/appCodeVersions/:id', function () {
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

  beforeEach(function (done) {
    multi.createContextVersion(function (err, contextVersion, context, build, user) {
      if (err) { return done(err) }
      ctx.contextVersion = contextVersion
      ctx.mainAppCodeVersion = contextVersion.attrs.appCodeVersions[0]
      ctx.context = context
      ctx.user = user
      done()
    })
  })
  describe('with master repo', function () {
    beforeEach(function (done) {
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
    it("it should update an appCodeVersion's branch", function (done) {
      var body = {
        branch: 'feature1'
      }
      var expected = ctx.appCodeVersion.json()
      expected.branch = body.branch
      expected.lowerBranch = body.branch.toLowerCase()
      ctx.appCodeVersion.update(body, expects.success(200, expected, done))
    })
    it("it should update an appCodeVersion's commit", function (done) {
      var body = {
        commit: 'abcdef'
      }
      var expected = ctx.appCodeVersion.json()
      expected.commit = body.commit
      ctx.appCodeVersion.update(body, expects.success(200, expected, done))
    })
    it("it should update an appCodeVersion's commit and branch", function (done) {
      var body = {
        branch: 'other-feature',
        commit: 'abcdef'
      }
      var expected = ctx.appCodeVersion.json()
      expected.commit = body.commit
      expected.branch = body.branch
      expected.lowerBranch = body.branch.toLowerCase()
      ctx.appCodeVersion.update(body, expects.success(200, expected, done))
    })
    it("should update an appCodeVersion's transformRules", function (done) {
      var transformRules = {
        exclude: ['a.txt'],
        replace: [
          { action: 'replace', search: 'hello', replace: "'allo" },
          { action: 'replace', search: 'friend', replace: 'poppet' }
        ],
        rename: [
          { action: 'rename', source: 'foo', dest: 'bar' },
          { action: 'rename', source: 'extreme', dest: 'x-treme' }
        ]
      }
      ctx.appCodeVersion.setTransformRules(transformRules, function (err, body, code) {
        if (err) { return done(err) }
        expect(code).to.equal(200)
        expect(body.transformRules.exclude).to.deep.contain(transformRules.exclude)
        transformRules.replace.forEach(function (rule, index) {
          expect(body.transformRules.replace[index]).to.deep.contain(rule)
        })
        transformRules.rename.forEach(function (rule, index) {
          expect(body.transformRules.rename[index]).to.deep.contain(rule)
        })
        done()
      })
    })
  })
  describe('with additionalRepo repo', function () {
    beforeEach(function (done) {
      ctx.repoName = 'conire'
      ctx.fullRepoName = ctx.user.json().accounts.github.login + '/' + ctx.repoName
      require('../../fixtures/mocks/github/repos-username-repo')(ctx.user, ctx.repoName)
      require('../../fixtures/mocks/github/repos-username-repo-hooks')(ctx.user, ctx.repoName)
      var body = {
        repo: ctx.fullRepoName,
        branch: 'master',
        commit: uuid(),
        additionalRepo: true,
        useLatest: true
      }
      var username = ctx.user.attrs.accounts.github.login
      require('../../fixtures/mocks/github/repos-keys-get')(username, ctx.repoName, true)
      ctx.addAppCodeVersion = ctx.contextVersion.addGithubRepo(body, done)
    })
    it("it should update an appCodeVersion's branch", function (done) {
      var body = {
        branch: 'feature1'
      }
      var expected = ctx.addAppCodeVersion.json()
      expected.branch = body.branch
      expected.lowerBranch = body.branch.toLowerCase()
      expected.additionalRepo = true
      expected.useLatest = true
      ctx.addAppCodeVersion.update(body, expects.success(200, expected, function (err) {
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
    it("it should update an addAppCodeVersion's commit", function (done) {
      var body = {
        commit: 'abcdef'
      }
      var expected = ctx.addAppCodeVersion.json()
      expected.commit = body.commit
      expected.additionalRepo = true
      expected.useLatest = true
      ctx.addAppCodeVersion.update(body, expects.success(200, expected, function (err) {
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
    it("it should update an addAppCodeVersion's commit and branch", function (done) {
      var body = {
        branch: 'other-feature',
        commit: 'abcdef'
      }
      var expected = ctx.addAppCodeVersion.json()
      expected.commit = body.commit
      expected.branch = body.branch
      expected.lowerBranch = body.branch.toLowerCase()
      expected.additionalRepo = true
      expected.useLatest = true
      ctx.addAppCodeVersion.update(body, expects.success(200, expected, function (err) {
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
    it("it should update an addAppCodeVersion's commit, branch and useLatest", function (done) {
      var body = {
        branch: 'other-feature',
        commit: 'abcdef',
        useLatest: false
      }
      var expected = ctx.addAppCodeVersion.json()
      expected.commit = body.commit
      expected.branch = body.branch
      expected.lowerBranch = body.branch.toLowerCase()
      expected.useLatest = body.useLatest
      expected.additionalRepo = true
      ctx.addAppCodeVersion.update(body, expects.success(200, expected, function (err) {
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
    it('it should NOT update additionalRepo', function (done) {
      var body = {
        branch: 'other-feature',
        commit: 'abcdef',
        additionalRepo: false
      }
      var expected = ctx.addAppCodeVersion.json()
      expected.commit = body.commit
      expected.branch = body.branch
      expected.lowerBranch = body.branch.toLowerCase()
      expected.additionalRepo = true
      ctx.addAppCodeVersion.update(body, expects.success(200, expected, function (err) {
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
