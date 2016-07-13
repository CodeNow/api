'use strict'

require('loadenv')()

var Lab = require('lab')
var Code = require('Code')

var lab = exports.lab = Lab.script()

var beforeEach = lab.beforeEach
var describe = lab.describe
var it = lab.it
var expect = Code.expect

var processOrigin = require('middlewares/cors').processOrigin

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('middlewares/cors unit test: ' + moduleName, function () {
  describe('#processOrigin', function () {
    var apiDomain = 'https://api.runnable.io'
    var frontendDomain = 'https://api.runnable.io'
    beforeEach(function (done) {
      process.env.ALLOW_ALL_CORS = false
      process.env.FULL_API_DOMAIN = apiDomain
      process.env.FULL_FRONTEND_DOMAIN = frontendDomain
      done()
    })

    it('should return `true` if `ALLOW_ALL_CORS` is true', function (done) {
      process.env.ALLOW_ALL_CORS = true
      processOrigin(null, function (err, allow) {
        expect(err).to.not.exist()
        expect(allow).to.equal(true)
        done()
      })
    })

    it('should return `true` if it matches the `FULL_API_DOMAIN`', function (done) {
      processOrigin(apiDomain, function (err, allow) {
        expect(err).to.not.exist()
        expect(allow).to.equal(true)
        done()
      })
    })

    it('should return `true` if it matches the `FULL_FRONTEND_DOMAIN`', function (done) {
      processOrigin(frontendDomain, function (err, allow) {
        expect(err).to.not.exist()
        expect(allow).to.equal(true)
        done()
      })
    })

    it('should return `false` if it does not match anything', function (done) {
      processOrigin('hello', function (err, allow) {
        expect(err).to.not.exist()
        expect(allow).to.equal(false)
        done()
      })
    })
  })
})
