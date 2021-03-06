'use strict'
require('loadenv')()

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var expect = require('code').expect
var it = lab.it
var after = lab.after
var afterEach = lab.afterEach
var before = lab.before
var beforeEach = lab.beforeEach
var sinon = require('sinon')

var request = require('request')

var api = require('../fixtures/api-control')
var Github = require('models/apis/github')
var getUserEmails = require('../fixtures/mocks/github/get-user-emails')
var multi = require('../fixtures/multi-factory')
var querystring = require('querystring')
var redis = require('models/redis')
var url = require('url')
const whitelistOrgs = require('../fixtures/mocks/big-poppa').whitelistOrgs
const whitelistUserOrgs = require('../fixtures/mocks/big-poppa').whitelistUserOrgs

describe('/auth/github routes', function () {
  var ctx = {}
  var testToken = '9999999999999999999999999999999999999999'
  var baseUrl = 'http://' + process.env.ROOT_DOMAIN + '/auth/github/'

  beforeEach(function (done) {
    redis.flushdb(done)
  })
  before(api.start.bind(ctx))
  after(api.stop.bind(ctx))
  before(function (done) {
    // Stub out Github API call for `beforeEach` and `it` statements
    sinon.stub(Github.prototype, 'getUserEmails').yieldsAsync(null, getUserEmails())
    done()
  })
  after(function (done) {
    Github.prototype.getUserEmails.restore()
    done()
  })
  beforeEach(function (done) {
    Github.prototype.getUserEmails.reset()
    done()
  })

  var runnableOrg = {
    name: 'Runnable',
    githubId: 2828361,
    allowed: true
  }
  describe('/auth/github/callback', function () {
    var target = baseUrl + 'callback'

    beforeEach(require('../fixtures/mocks/github/login'))
    beforeEach(function (done) {
      whitelistOrgs([runnableOrg])
      ctx.user = multi.createUser(done)
    })
    beforeEach(function (done) {
      whitelistUserOrgs(ctx.user, [runnableOrg])
      done()
    })
    afterEach(require('../fixtures/clean-nock'))

    it('should redirect without token if none requested', function (done) {
      require('../fixtures/mocks/github/user')(ctx.user, null, testToken)
      request.get({
        url: target,
        followRedirect: false,
        qs: { code: testToken }
      }, function (err, res) {
        if (err) { return done(err) }
        expect(res.statusCode).to.equal(302)
        var testUrl = url.parse(res.headers.location)
        var qs = querystring.parse(testUrl.query)
        expect(qs.runnableappAccessToken).to.not.exist()
        done()
      })
    })

    it('should pass one time use token', function (done) {
      var j = request.jar()
      var testRedir = 'http://runnableapp.com:9283/datPath?thisqs=great'
      require('../fixtures/mocks/github/user')(ctx.user, null, testToken)
      request.get({
        jar: j,
        url: baseUrl,
        followRedirect: false,
        qs: {
          requiresToken: 'true',
          redirect: testRedir
        }
      }, function (err, res) {
        if (err) { return done(err) }
        request.get({
          jar: j,
          url: target,
          followRedirect: false,
          qs: { code: testToken }
        }, function (err, res) {
          if (err) { return done(err) }
          var testUrl = url.parse(res.headers.location)
          var qs = querystring.parse(testUrl.query)
          expect(res.statusCode).to.equal(302)
          expect(testUrl.protocol).to.equal('http:')
          expect(testUrl.host).to.equal('runnableapp.com:9283')
          expect(testUrl.pathname).to.equal('/datPath')
          expect(qs.runnableappAccessToken).to.exist()
          expect(qs.thisqs).to.equal('great')
          done()
        })
      })
    })
  })
})
