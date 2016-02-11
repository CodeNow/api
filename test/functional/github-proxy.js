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

var api = require('./fixtures/api-control')
var multi = require('./fixtures/multi-factory')
var createCount = require('callback-count')
var concat = require('concat-stream')
var zlib = require('zlib')
var redis = require('models/redis')
var async = require('async')
var nock = require('nock')
var url = require('url')

describe('Github Proxy', function () {
  var ctx = {}
  before(api.start.bind(ctx))
  after(api.stop.bind(ctx))
  afterEach(require('./fixtures/clean-mongo').removeEverything)
  afterEach(require('./fixtures/clean-ctx')(ctx))

  beforeEach(function (done) {
    redis.keys('github-proxy-cache:*', function (err, data) {
      if (err) { return done(err) }
      async.each(data, function (key, cb) {
        redis.del(key, cb)
      }, done)
    })
  })
  beforeEach(function (done) {
    multi.createUser(function (err, user) {
      ctx.user = user
      done(err)
    })
  })

  describe('/user', function () {
    beforeEach(function (done) {
      var count = createCount(2, done)
      require('./fixtures/mocks/github/user-gzip')(ctx.user, null, null, count.next)
      ctx.user.fetch(function (err) { count.next(err) })
    })
    it('should return the current user', function (done) {
      var r = ctx.user.client.get('/github/user')
      r.on('error', done)
      r.pipe(zlib.createGunzip()).pipe(concat(function (body) {
        body = JSON.parse(body.toString())
        expect(body).to.exist()
        expect(body.login).to.equal(ctx.user.json().accounts.github.username)
        done()
      }))
    })
    it('should have the correct link headers', function (done) {
      var r = ctx.user.client.get('/github/user')
      r.on('error', done)
      r.pipe(zlib.createGunzip()).pipe(concat(function (body) {
        expect(body).to.exist()
        var linkRegexp = /<([^>]+)> rel\=\"\w+\"/
        var parsedTestDomain = url.parse(process.env.FULL_API_DOMAIN)
        r.response.headers.link.split(', ').forEach(function (link) {
          var matches = linkRegexp.exec(link)
          var parsedLink = url.parse(matches[1])
          expect(parsedLink.host).to.equal(parsedTestDomain.host)
          expect(parsedLink.protocol).to.equal(parsedTestDomain.protocol)
          expect(parsedLink.pathname.indexOf('/github')).to.equal(0)
        })
        done()
      }))
    })
    it('should have the correct headers', function (done) {
      var r = ctx.user.client.get('/github/user')
      r.on('error', done)
      r.pipe(zlib.createGunzip()).pipe(concat(function (body) {
        expect(body).to.exist()
        // in this case, because of the test, we shouldn't have access-control-allow-origin
        // (it would be the value set from github if it was here)
        expect(r.response.headers['access-control-allow-origin']).to.equal(undefined)
        expect(r.response.headers['access-control-allow-credentials']).to.equal('true')
        done()
      }))
    })
    it('should have the correct headers when it comes from the cache', function (done) {
      var r = ctx.user.client.get('/github/user')
      r.on('error', done)
      r.pipe(zlib.createGunzip()).pipe(concat(function (body) {
        expect(body).to.exist()
        // in this case, because of the test, we shouldn't have access-control-allow-origin
        // (it would be the value set from github if it was here)
        expect(r.response.headers['access-control-allow-origin']).to.equal(undefined)
        expect(r.response.headers['access-control-allow-credentials']).to.equal('true')
        // for a cache hit
        nock('https://api.github.com:443')
          .get('/user?access_token=' + ctx.user.json().accounts.github.access_token)
          .reply(304, null, {
            'access-control-allow-origin': '*',
            'access-control-allow-credentials': 'true'
          })
        var r2 = ctx.user.client.get('/github/user')
        r2.on('error', done)
        r2.pipe(zlib.createGunzip()).pipe(concat(function (body) {
          expect(body).to.exist()
          expect(r2.response.headers['access-control-allow-origin']).to.equal(undefined)
          expect(r2.response.headers['access-control-allow-credentials']).to.equal('true')
          done()
        }))
      }))
    })
  })
})
