'use strict'

require('loadenv')()

var Lab = require('lab')
var keypather = require('keypather')()
var sinon = require('sinon')

var lab = exports.lab = Lab.script()

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var it = lab.it

var securityMiddleware = require('middlewares/security')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('middlewares/security unit test: ' + moduleName, function () {
  var req
  var res
  var next
  beforeEach(function (done) {
    req = {
      headers: {
        host: 'host'
      },
      originalUrl: 'originalUrl'
    }
    res = {
      status: sinon.stub(),
      setHeader: sinon.stub(),
      end: sinon.stub()
    }
    next = sinon.stub()
    done()
  })

  describe('with ASSERT_HTTPS set to false', function () {
    var originalAssertHTTPS
    beforeEach(function (done) {
      originalAssertHTTPS = process.env.ASSERT_HTTPS
      process.env.ASSERT_HTTPS = 'false'
      done()
    })

    afterEach(function (done) {
      process.env.ASSERT_HTTPS = originalAssertHTTPS
      done()
    })

    it('should just call next', function (done) {
      securityMiddleware(req, res, next)
      sinon.assert.calledOnce(next)
      sinon.assert.notCalled(res.status)
      sinon.assert.notCalled(res.setHeader)
      sinon.assert.notCalled(res.end)
      done()
    })
  })

  describe('with ASSERT_HTTPS set to true', function () {
    var originalAssertHTTPS
    beforeEach(function (done) {
      originalAssertHTTPS = process.env.ASSERT_HTTPS
      process.env.ASSERT_HTTPS = 'true'
      done()
    })

    afterEach(function (done) {
      process.env.ASSERT_HTTPS = originalAssertHTTPS
      done()
    })

    describe('when being hit with the https protocol', function () {
      beforeEach(function (done) {
        req.headers['x-forwarded-protocol'] = 'https'
        done()
      })

      it('should add the STS header', function (done) {
        securityMiddleware(req, res, next)
        sinon.assert.calledOnce(next)
        sinon.assert.notCalled(res.status)
        sinon.assert.notCalled(res.end)
        sinon.assert.calledOnce(res.setHeader)
        sinon.assert.calledWith(res.setHeader, 'Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
        done()
      })
    })

    describe('when being hit with the http protocol', function () {
      beforeEach(function (done) {
        req.headers['x-forwarded-protocol'] = 'http'
        done()
      })

      it('should redirect', function (done) {
        securityMiddleware(req, res, next)
        sinon.assert.notCalled(next)
        sinon.assert.calledOnce(res.status)
        sinon.assert.calledWith(res.status, 301)
        sinon.assert.calledOnce(res.end)
        sinon.assert.calledTwice(res.setHeader)
        sinon.assert.calledWith(res.setHeader, 'Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
        sinon.assert.calledWith(res.setHeader, 'Location', 'https://' + req.headers.host + req.originalUrl)
        done()
      })
    })


  })
})
