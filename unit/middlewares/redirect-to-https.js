/**
 * @module unit/middlewares/redirect-to-https
 */
'use strict'

require('loadenv')()

var Code = require('code')
var Lab = require('lab')
var sinon = require('sinon')

var redirectToHTTPS = require('middlewares/redirect-to-https')

var lab = exports.lab = Lab.script()

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('/lib/middlewares/redirect-to-https', function () {
  var req = {}
  var res = {}

  beforeEach(function (done) {
    res.redirect = sinon.stub()
    done()
  })

  afterEach(function (done) {
    delete process.env.REDIRECT_TO_HTTPS
    done()
  })

  it('should not redirect if feature-flag env is not set', function (done) {
    redirectToHTTPS(req, res, function (err) {
      expect(err).to.be.undefined()
      sinon.assert.notCalled(res.redirect)
      done()
    })
  })

  it('should not redirect if request to proxy was HTTPS', function (done) {
    req.headers = {
      'x-forwarded-protocol': 'https'
    }
    process.env.REDIRECT_TO_HTTPS = true
    redirectToHTTPS(req, res, function (err) {
      expect(err).to.be.undefined()
      sinon.assert.notCalled(res.redirect)
      done()
    })
  })

  it('should redirect if request to proxy was HTTP', function (done) {
    req.headers = {
      'x-forwarded-protocol': 'http',
      host: 'api.runnable.io'
    }
    req.url = '/users/me'
    process.env.REDIRECT_TO_HTTPS = true
    redirectToHTTPS(req, res, function (err) {
      expect(err).to.be.undefined()
      sinon.assert.calledOnce(res.redirect)
      sinon.assert.calledWith(res.redirect, 'https://api.runnable.io/users/me')
      done()
    })
  })
})
