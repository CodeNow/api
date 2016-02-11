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
  before(function (done) {
    api.start(done)
  })
  after(function (done) {
    api.stop(done)
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

  describe('without proper CSRF token', function () {
    it('should fail a delete request', function (done) {
      var opts = {
        method: 'DELETE',
        url: process.env.FULL_API_DOMAIN + '/auth',
        json: true,
        jar: ctx.j,
        headers: {
          Origin: 'http://localhost'
        }
      }
      request(opts, function (err, res) {
        expect(err).to.not.exist()
        expect(res.statusCode).to.equal(403)
        expect(res.body.message).to.contain('CSRF')
        done()
      })
    })
  })

  describe('with proper CSRF token', function () {
    it('should allow the request through', function (done) {
      var opts = {
        method: 'GET',
        url: process.env.FULL_API_DOMAIN + '/users/me',
        json: true,
        jar: ctx.j,
        headers: {
          Origin: 'http://localhost'
        }
      }
      request(opts, function (err, res) {
        expect(err).to.not.exist()
        expect(res.statusCode).to.equal(401)
        var csrfCookie = null
        res.headers['set-cookie'].forEach(function (header) {
          if (header.indexOf('CSRF-TOKEN') === 0) {
            csrfCookie = header
          }
        })
        var csrfToken = csrfCookie.split('=')[1].split(';')[0]
        var opts = {
          method: 'DELETE',
          url: process.env.FULL_API_DOMAIN + '/auth',
          json: true,
          headers: {
            'X-CSRF-TOKEN': csrfToken,
            Origin: 'http://localhost'
          },
          jar: ctx.j
        }
        request(opts, function (err, res) {
          expect(err).to.not.exist()
          expect(res.statusCode).to.equal(200)
          expect(res.body.message).to.not.contain('CSRF')
          expect(res.body.message).to.contain('success')
          done()
        })
      })
    })
  })
})
