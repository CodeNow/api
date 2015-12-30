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

var request = require('request')
var randStr = require('randomstring').generate

var ctx = {}
describe('CSRF Validation', function () {
  var oldEnv = null
  before(function (done) {
    oldEnv = process.env.CSRF_IGNORED_METHODS
    process.env.CSRF_IGNORED_METHODS = 'GET,HEAD,OPTIONS'

    // Need to kill the cache so we can change the env and re-execute setting up the app...
    delete require.cache[require.resolve('express-app')]
    delete require.cache[require.resolve('../../app')]
    delete require.cache[require.resolve('./fixtures/api-control')]

    api = require('./fixtures/api-control')
    done()
  })
  before(function (done) {
    api.start(done)
  })
  after(function (done) {
    api.stop(done)
  })
  after(function (done) {
    process.env.CSRF_IGNORED_METHODS = oldEnv
    done()
  })
  beforeEach(function (done) {
    ctx.name = randStr(5)
    done()
  })
  before(function (done) {
    ctx.j = request.jar()
    done()
  })
  afterEach(require('./fixtures/clean-mongo').removeEverything)

  describe('without proper XSRF token', function () {
    it('should fail a delete request', function (done) {
      var opts = {
        method: 'DELETE',
        url: process.env.FULL_API_DOMAIN + '/auth',
        json: true,
        jar: ctx.j
      }
      request(opts, function (err, res) {
        expect(err).to.not.exist()
        expect(res.statusCode).to.equal(403)
        expect(res.body.message).to.contain('XSRF')
        done()
      })
    })
  })

  describe('with proper XSRF token', function () {
    it('should allow the request through', function (done) {
      var opts = {
        method: 'GET',
        url: process.env.FULL_API_DOMAIN + '/users/me',
        json: true,
        jar: ctx.j
      }
      request(opts, function (err, res) {
        expect(err).to.not.exist()
        expect(res.statusCode).to.equal(401)
        var xsrfCookie = null
        res.headers['set-cookie'].forEach(function (header) {
          if (header.indexOf('XSRF-TOKEN') === 0) {
            xsrfCookie = header
          }
        })
        var xsrfToken = xsrfCookie.split('=')[1].split(';')[0]
        var opts = {
          method: 'DELETE',
          url: process.env.FULL_API_DOMAIN + '/auth',
          json: true,
          headers: {
            'X-CSRF-TOKEN': xsrfToken
          },
          jar: ctx.j
        }
        request(opts, function (err, res) {
          expect(err).to.not.exist()
          expect(res.statusCode).to.equal(200)
          expect(res.body.message).to.not.contain('XSRF')
          expect(res.body.message).to.contain('success')
          done()
        })
      })
    })
  })
})
