'use strict'

require('loadenv')()

var Lab = require('lab')
var keypather = require('keypather')()
var rewire = require('rewire')
var sinon = require('sinon')

var lab = exports.lab = Lab.script()

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var it = lab.it

var csurfMiddleware = rewire('middlewares/csrf')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('middlewares/csrf unit test: ' + moduleName, function () {
  var req
  var res
  var next
  var mockCsurf
  var oldCsurf
  beforeEach(function (done) {
    mockCsurf = sinon.stub()
    oldCsurf = csurfMiddleware.__get__('csurfMiddleware')
    csurfMiddleware.__set__('csurfMiddleware', mockCsurf)
    req = {}
    res = {}
    next = sinon.stub()
    done()
  })

  afterEach(function (done) {
    csurfMiddleware.__set__('csurfMiddleware', oldCsurf)
    done()
  })

  describe('csrfValidator', function () {
    describe('with origin', function () {
      beforeEach(function (done) {
        keypather.set(req, 'headers.origin', 'http://google.com')
        done()
      })

      it('should pass through to the csurf middleware', function (done) {
        csurfMiddleware.csrfValidator(req, res, next)
        sinon.assert.calledOnce(mockCsurf)
        sinon.assert.calledWith(mockCsurf, req, res, next)
        done()
      })
    })

    describe('without origin', function () {
      beforeEach(function (done) {
        keypather.set(req, 'headers', {})
        done()
      })

      it('should bypass the entire middleware', function (done) {
        csurfMiddleware.csrfValidator(req, res, next)
        sinon.assert.calledOnce(next)
        sinon.assert.notCalled(mockCsurf)
        done()
      })
    })
  })

  describe('csrfCookieInjector', function () {
    var oldDomain
    beforeEach(function (done) {
      res.cookie = sinon.stub()
      req.csrfToken = sinon.stub().returns('CSRFTOKEN')
      oldDomain = process.env.FULL_API_DOMAIN
      process.env.FULL_API_DOMAIN = 'http://example.com'
      done()
    })

    afterEach(function (done) {
      process.env.FULL_API_DOMAIN = oldDomain
      done()
    })

    describe('with origin', function () {
      beforeEach(function (done) {
        keypather.set(req, 'headers.origin', 'http://google.com')
        done()
      })

      it('should add a cookie with the right parameters', function (done) {
        csurfMiddleware.csrfCookieInjector(req, res, next)
        sinon.assert.calledOnce(res.cookie)
        sinon.assert.calledOnce(req.csrfToken)

        sinon.assert.calledWith(res.cookie, 'CSRF-TOKEN', 'CSRFTOKEN', {
          httpOnly: false,
          domain: '.example.com'
        })
        done()
      })
    })
    describe('without origin', function () {
      beforeEach(function (done) {
        keypather.set(req, 'headers', {})
        done()
      })

      it('should bypass the entire middleware', function (done) {
        csurfMiddleware.csrfCookieInjector(req, res, next)
        sinon.assert.notCalled(res.cookie)
        done()
      })
    })
  })
})
