'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var expect = require('code').expect
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach

var sinon = require('sinon')
var tokenAuth = require('models/auth/token-auth')
var RedisToken = require('models/redis/token')
var error = require('error')
var querystring = require('querystring')
var url = require('url')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('token.js unit test: ' + moduleName, function () {
  describe('createWithSessionId', function () {
    beforeEach(function (done) {
      sinon.stub(RedisToken.prototype, 'setValue')
      done()
    })
    afterEach(function (done) {
      RedisToken.prototype.setValue.restore()
      done()
    })
    it('should cb if not required', function (done) {
      tokenAuth.createWithSessionId({}, {}, function (err) {
        expect(err).to.not.exist()
        expect(RedisToken.prototype.setValue.called).to.be.false()
        done()
      })
    })
    it('should log error if setting token failed', function (done) {
      var testErr = 'whodateerr'
      var testCookie = 'yummy'
      var sessionId = 12345
      RedisToken.prototype.setValue.yields(testErr)
      sinon.stub(error, 'log').returns()

      tokenAuth.createWithSessionId({
        id: sessionId,
        requiresToken: true
      }, testCookie, function (err) {
        expect(err).to.not.exist()
        expect(error.log.calledWith(testErr)).to.be.true()
        expect(RedisToken.prototype.setValue.calledWith(JSON.stringify({
          cookie: testCookie,
          apiSessionRedisKey: process.env.REDIS_SESSION_STORE_PREFIX + sessionId
        }))).to.be.true()
        error.log.restore()
        done()
      })
    })
    it('should add runnableappAccessToken to callback url', function (done) {
      var testCookie = 'yummy'
      var testRedir = 'http://thisredir:9283/datPath?thisqs=great'
      var sessionId = 12345
      var session = {
        id: sessionId,
        requiresToken: true,
        authCallbackRedirect: testRedir
      }
      RedisToken.prototype.setValue.yields()
      tokenAuth.createWithSessionId(session, testCookie, function (err) {
        var testUrl = url.parse(session.authCallbackRedirect)
        var qs = querystring.parse(testUrl.query)
        expect(testUrl.protocol).to.equal('http:')
        expect(testUrl.host).to.equal('thisredir:9283')
        expect(testUrl.pathname).to.equal('/datPath')
        expect(qs.runnableappAccessToken).to.exist()
        expect(qs.thisqs).to.equal('great')
        expect(err).to.not.exist()
        expect(RedisToken.prototype.setValue.calledWith(JSON.stringify({
          cookie: testCookie,
          apiSessionRedisKey: process.env.REDIS_SESSION_STORE_PREFIX + sessionId
        }))).to.be.true()
        done()
      })
    })
  })
})
