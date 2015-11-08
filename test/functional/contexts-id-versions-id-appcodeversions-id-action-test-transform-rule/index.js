'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach
var expect = require('code').expect
var sinon = require('sinon')

var optimus = require('optimus/client')
var last = require('101/last')

var api = require('../fixtures/api-control')
var dock = require('../fixtures/dock')
var multi = require('../fixtures/multi-factory')
var primus = require('../fixtures/primus')

describe('POST /contexts/:id/versions/:id/appCodeVersions/:id/actions/testTransformRule', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  before(dock.start.bind(ctx))
  beforeEach(primus.connect)
  afterEach(primus.disconnect)
  after(api.stop.bind(ctx))
  after(dock.stop.bind(ctx))
  afterEach(require('../fixtures/clean-mongo').removeEverything)
  afterEach(require('../fixtures/clean-ctx')(ctx))
  afterEach(require('../fixtures/clean-nock'))

  beforeEach(function (done) {
    ctx.optimusResponse = {
      warnings: [],
      results: [
        {
          rule: { action: 'replace', search: 'foo', replace: 'bar' },
          warnings: [],
          nameChanges: [],
          diffs: { '/a.txt': 'foo-bar-diff' }
        },
        {
          rule: { action: 'replace', search: 'bar', replace: 'baz' },
          warnings: [],
          nameChanges: [],
          diffs: { '/a.txt': 'bar-baz-diff' }
        },
        {
          rule: { action: 'replace', search: 'baz', replace: 'bif' },
          warnings: [],
          nameChanges: [],
          diffs: { '/a.txt': 'baz-bif-diff' }
        }
      ],
      diff: 'replace-diff',
      script: 'replace-script'
    }

    ctx.transformRules = {
      exclude: ['a.txt'],
      replace: [
        { action: 'replace', search: 'foo', replace: 'bar' },
        { action: 'replace', search: 'bar', replace: 'baz' },
        { action: 'replace', search: 'baz', replace: 'bif' }
      ],
      rename: [
        { action: 'rename', source: 'w.txt', dest: 'z.txt' },
        { action: 'rename', source: 'z.txt', dest: 'k.txt' },
        { action: 'rename', source: 'k.txt', dest: 'p.txt' }
      ]
    }

    sinon.stub(optimus, 'transform').yieldsAsync(null, {
      body: ctx.optimusResponse
    })

    multi.createContextVersion(function (err, contextVersion, context, build, user) {
      if (err) { return done(err) }
      ctx.contextVersion = contextVersion
      ctx.context = context
      ctx.user = user
      ctx.repoName = 'Dat-middleware'
      ctx.fullRepoName = ctx.user.json().accounts.github.login + '/' + ctx.repoName
      require('../fixtures/mocks/github/repos-username-repo')(ctx.user, ctx.repoName)
      require('../fixtures/mocks/github/repos-username-repo-hooks')(ctx.user, ctx.repoName)
      var username = ctx.user.attrs.accounts.github.login
      require('../fixtures/mocks/github/repos-keys-get')(username, ctx.repoName, true)
      ctx.appCodeVersion = ctx.contextVersion.appCodeVersions.models[0]
      done()
    })
  })

  beforeEach(function (done) {
    ctx.appCodeVersion.setTransformRules(ctx.transformRules, function (err, resp) {
      if (err) { return done(err) }
      ctx.renameRule = resp.transformRules.rename[1]
      ctx.replaceRule = resp.transformRules.replace[1]
      done()
    })
  })

  afterEach(function (done) {
    optimus.transform.restore()
    done()
  })

  it('should test a new replace rule', function (done) {
    var rule = { action: 'replace', search: 'dood', replace: 'rood' }
    ctx.appCodeVersion.testTransformRule(rule, function (err, resp) {
      if (err) { return done(err) }
      expect(resp).to.deep.equal(last(ctx.optimusResponse.results))

      var expectedRuleSet = [
        { action: 'exclude', files: [ 'a.txt' ] },
        { action: 'replace', search: 'foo', replace: 'bar' },
        { action: 'replace', search: 'bar', replace: 'baz' },
        { action: 'replace', search: 'baz', replace: 'bif' },
        rule
      ]

      var optimusRules = optimus.transform.firstCall.args[0].rules
      expectedRuleSet.forEach(function (expected, index) {
        Object.keys(expected).forEach(function (key) {
          expect(optimusRules[index][key]).to.deep.equal(expected[key])
        })
      })
      done()
    })
  })

  it('should test a new rename rule', function (done) {
    var rule = { action: 'rename', source: 'cool.txt', dest: 'world.txt' }
    ctx.appCodeVersion.testTransformRule(rule, function (err, resp) {
      if (err) { return done(err) }
      expect(resp).to.deep.equal(last(ctx.optimusResponse.results))

      var expectedRuleSet = [
        { action: 'exclude', files: [ 'a.txt' ] },
        { action: 'rename', source: 'w.txt', dest: 'z.txt' },
        { action: 'rename', source: 'z.txt', dest: 'k.txt' },
        { action: 'rename', source: 'k.txt', dest: 'p.txt' },
        rule
      ]

      var optimusRules = optimus.transform.firstCall.args[0].rules
      expectedRuleSet.forEach(function (expected, index) {
        Object.keys(expected).forEach(function (key) {
          expect(optimusRules[index][key]).to.deep.equal(expected[key])
        })
      })
      done()
    })
  })

  it('should test a change to an existing replace rule', function (done) {
    ctx.appCodeVersion.testTransformRule(ctx.replaceRule, function (err, resp) {
      if (err) { return done(err) }
      expect(resp).to.deep.equal(last(ctx.optimusResponse.results))

      var expectedRuleSet = [
        { action: 'exclude', files: [ 'a.txt' ] },
        { action: 'replace', search: 'foo', replace: 'bar' },
        ctx.replaceRule
      ]

      var optimusRules = optimus.transform.firstCall.args[0].rules
      expectedRuleSet.forEach(function (expected, index) {
        Object.keys(expected).forEach(function (key) {
          expect(optimusRules[index][key]).to.deep.equal(expected[key])
        })
      })
      done()
    })
  })

  it('should test a change to an existing rename rule', function (done) {
    ctx.appCodeVersion.testTransformRule(ctx.renameRule, function (err, resp) {
      if (err) { return done(err) }
      expect(resp).to.deep.equal(last(ctx.optimusResponse.results))

      var expectedRuleSet = [
        { action: 'exclude', files: [ 'a.txt' ] },
        { action: 'rename', source: 'w.txt', dest: 'z.txt' },
        ctx.renameRule
      ]

      var optimusRules = optimus.transform.firstCall.args[0].rules
      expectedRuleSet.forEach(function (expected, index) {
        Object.keys(expected).forEach(function (key) {
          expect(optimusRules[index][key]).to.deep.equal(expected[key])
        })
      })
      done()
    })
  })

  it('should respond with 400 bad request if given a rule without an action', function (done) {
    var malformedRule = { search: 'foo' }
    var expectedMessage = 'Supplied transformation rule requires an action attribute.'
    ctx.appCodeVersion.testTransformRule(malformedRule, function (err) {
      expect(err).to.exist()
      expect(err.data.res.statusCode).to.equal(400)
      expect(err.data.res.body.message).to.equal(expectedMessage)
      done()
    })
  })

  it('should respond with 400 bad request if given a rule with a non-string action', function (done) {
    var malformedRule = { action: { hello: 'world' }, search: 'foo' }
    var expectedMessage = 'Supplied transformation rule requires an action attribute.'
    ctx.appCodeVersion.testTransformRule(malformedRule, function (err) {
      expect(err).to.exist()
      expect(err.data.res.statusCode).to.equal(400)
      expect(err.data.res.body.message).to.equal(expectedMessage)
      done()
    })
  })

  it('should respond with 400 bad request if given a rule with an invalid action', function (done) {
    var malformedRule = { action: 'invalid', search: 'foo' }
    var expectedMessage = 'Invalid action "invalid" given' +
      ' for test rule. Expected "rename" or "replace".'
    ctx.appCodeVersion.testTransformRule(malformedRule, function (err) {
      expect(err).to.exist()
      expect(err.data.res.statusCode).to.equal(400)
      expect(err.data.res.body.message).to.equal(expectedMessage)
      done()
    })
  })

  it('should respond with 400 bad request if the given rule id could not be found', function (done) {
    var unknownRule = { action: 'rename', source: 'src', dest: 'dest', _id: 'invalid' }
    var expectedMessage = 'Rule with given _id: "invalid" was not found.'
    ctx.appCodeVersion.testTransformRule(unknownRule, function (err) {
      expect(err).to.exist()
      expect(err.data.res.statusCode).to.equal(400)
      expect(err.data.res.body.message).to.equal(expectedMessage)
      done()
    })
  })

  it('should report gateway timeouts (504) when optimus times out', function (done) {
    var error = new Error('totes busted')
    optimus.transform.yieldsAsync(error)
    ctx.appCodeVersion.testTransformRule(ctx.replaceRule, function (err) {
      expect(err.data.res.statusCode).to.equal(504)
      done()
    })
  })

  it('should report a bad gateway (502) when optimus returns a 5XX', function (done) {
    var errMessage = 'Dis ist zee errorz'
    optimus.transform.yieldsAsync(null, {
      statusCode: 500,
      body: {
        message: errMessage
      }
    })
    ctx.appCodeVersion.testTransformRule(ctx.replaceRule, function (err) {
      expect(err.data.res.statusCode).to.equal(502)
      expect(err.data.res.body.message).to.equal(errMessage)
      done()
    })
  })

  it('should directly respond with 4XXs given by optimus', function (done) {
    var errMessage = 'Parameter `commitish` is required.'
    optimus.transform.yieldsAsync(null, {
      statusCode: 400,
      body: {
        message: errMessage
      }
    })
    ctx.appCodeVersion.testTransformRule(ctx.replaceRule, function (err) {
      expect(err.data.res.statusCode).to.equal(400)
      expect(err.data.res.body.message).to.equal(errMessage)
      done()
    })
  })
})
