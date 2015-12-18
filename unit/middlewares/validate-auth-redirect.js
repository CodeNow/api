/**
 * @module unit/middlewares/validate-auth-redirect
 */
'use strict'

require('loadenv')()

var Code = require('code')
var Lab = require('lab')

var validateAuthRedirect = require('middlewares/validate-auth-redirect')

var lab = exports.lab = Lab.script()

var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('lib/middlewares/validate-auth-redirect', function () {
  it('should next if !req.query.redirect', function (done) {
    var req = {
      query: {}
    }
    validateAuthRedirect(req, {}, function (err) {
      expect(err).to.be.undefined()
      expect(req.query.redirect).to.be.undefined()
      done()
    })
  })

  it('should delete req.query.redirect if value is invalid', function (done) {
    var req = {
      query: {
        redirect: 'asdf'
      }
    }
    validateAuthRedirect(req, {}, function (err) {
      expect(err).to.be.undefined()
      expect(req.query.redirect).to.be.undefined()
      done()
    })
  })

  it('should delete req.query.redirect if hostname of value is not in whitelist', function (done) {
    var req = {
      query: {
        redirect: 'http://api.somethingelse.com/hello'
      }
    }
    validateAuthRedirect(req, {}, function (err) {
      expect(err).to.be.undefined()
      expect(req.query.redirect).to.be.undefined()
      done()
    })
  })

  it('should not delete req.query.redirect if hostname of value is in whitelist', function (done) {
    var req = {
      query: {
        redirect: 'http://runnablecloud.com/hello'
      }
    }
    validateAuthRedirect(req, {}, function (err) {
      expect(err).to.be.undefined()
      expect(req.query.redirect).to.equal('http://runnablecloud.com/hello')
      done()
    })
  })
})
