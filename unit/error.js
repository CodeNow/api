'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var Code = require('code')
var expect = Code.expect

var error = require('error')

var sinon = require('sinon')
var rollbar = require('rollbar')
var Boom = require('dat-middleware').Boom

// this is going to be a little weird, since we have to set NODE_ENV to not be
// `test` to get this to work. Let's see what happens...

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('Error: ' + moduleName, function () {
    describe('is4XX', function () {
    it('should return true for 4XX err', function (done) {
      expect(error.is4XX(Boom.badRequest('boom'))).to.be.true()
      done()
    })
    it('should return false for other errs', function (done) {
      expect(error.is4XX(null)).to.be.false()
      expect(error.is4XX(new Error())).to.be.false()
      expect(error.is4XX(Boom.badImplementation('boom'))).to.be.false()
      done()
    })
  })
})
