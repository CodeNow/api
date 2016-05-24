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

var api = require('../fixtures/api-control')
var dock = require('../fixtures/dock')
var multi = require('../fixtures/multi-factory')
var primus = require('../fixtures/primus')

var InfraCodeVersion = require('../../../lib/models/mongo/infra-code-version')

describe('POST /contexts/:id/versions/:id/appCodeVersions/:id/actions/applyTransformRules', function () {
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
      results: [],
      diff: 'example-diff',
      script: 'example-script'
    }

    ctx.expectedRuleSet = [
      { action: 'exclude', files: ['a.txt'] },
      { action: 'replace', search: 'foo', replace: 'bar' },
      { action: 'rename', source: 'w.txt', dest: 'z.txt' }
    ]

    ctx.transformRules = {
      exclude: ['a.txt'],
      replace: [
        { action: 'replace', search: 'foo', replace: 'bar' }
      ],
      rename: [
        { action: 'rename', source: 'w.txt', dest: 'z.txt' }
      ]
    }

    sinon.stub(optimus, 'transform').yieldsAsync(null, {
      body: ctx.optimusResponse
    })

    ctx.upsertFs = sinon.stub(InfraCodeVersion.prototype, 'upsertFs').yieldsAsync(
      null, { body: ctx.optimusResponse }
    )

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
    ctx.appCodeVersion.setTransformRules(ctx.transformRules, done)
  })

  afterEach(function (done) {
    optimus.transform.restore()
    InfraCodeVersion.prototype.upsertFs.restore()
    done()
  })

  it('should construct rule set and request results from optimus', function (done) {
    ctx.appCodeVersion.runTransformRules(function (err, body, code) {
      if (err) { return done(err) }
      expect(code).to.equal(200)
      expect(optimus.transform.calledOnce).to.be.true()
      var optimusRules = optimus.transform.firstCall.args[0].rules
      ctx.expectedRuleSet.forEach(function (rule, index) {
        Object.keys(rule).forEach(function (key) {
          expect(rule[key]).to.deep.equal(optimusRules[index][key])
        })
      })
      done()
    })
  })

  it('should save the script to the build files', function (done) {
    ctx.appCodeVersion.runTransformRules(function (err) {
      if (err) { return done(err) }
      expect(ctx.upsertFs.calledOnce).to.be.true()
      expect(ctx.upsertFs.calledWith(
        '/translation_rules.sh',
        ctx.optimusResponse.script
      )).to.be.true()
      done()
    })
  })

  it('should report gateway timeouts (504) when optimus times out', function (done) {
    var error = new Error('totes busted')
    optimus.transform.yieldsAsync(error)
    ctx.appCodeVersion.runTransformRules(function (err) {
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
    ctx.appCodeVersion.runTransformRules(function (err) {
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
    ctx.appCodeVersion.runTransformRules(function (err) {
      expect(err.data.res.statusCode).to.equal(400)
      expect(err.data.res.body.message).to.equal(errMessage)
      done()
    })
  })
})
