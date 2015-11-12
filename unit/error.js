'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect

var error = require('error')

var sinon = require('sinon')
var rollbar = require('rollbar')
var Boom = require('dat-middleware').Boom

var ctx = {}

// this is going to be a little weird, since we have to set NODE_ENV to not be
// `test` to get this to work. Let's see what happens...

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('Error: ' + moduleName, function () {
  describe('should send to rollbar', function () {
    beforeEach(function (done) {
      // no more `test` env value
      ctx.nodeEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'not-test'
      ctx.logErrors = process.env.LOG_ERRORS
      process.env.LOG_ERRORS = true
      // stub rollbar
      sinon.stub(rollbar, 'handleErrorWithPayloadData').yieldsAsync()
      done()
    })
    afterEach(function (done) {
      // reset NODE_ENV
      process.env.NODE_ENV = ctx.nodeEnv
      delete process.env.LOG_ERRORS
      // reset rollbar
      rollbar.handleErrorWithPayloadData.restore()
      done()
    })

    it('log to rollbar with data', function (done) {
      var e = Boom.notFound('hello error')
      error.log(e)
      expect(rollbar.handleErrorWithPayloadData.calledOnce).to.be.true()
      expect(rollbar.handleErrorWithPayloadData.getCall(0).args[0].message)
        .to.equal('hello error')
      done()
    })

    it('log to rollbar with log levels', function (done) {
      var e = Boom.notFound('hello error', { level: 'info' })
      error.log(e, { level: 'info' })
      expect(rollbar.handleErrorWithPayloadData.calledOnce).to.be.true()
      expect(rollbar.handleErrorWithPayloadData.getCall(0).args[0].message)
        .to.equal('hello error')
      expect(rollbar.handleErrorWithPayloadData.getCall(0).args[1])
        .to.deep.contain({ level: 'info' });
      done();
    });
  });

  describe('is4XX', function() {
    it('should return true for 4XX err', function (done) {
      expect(error.is4XX(Boom.badRequest('boom'))).to.be.true();
      done();
    });
    it('should return false for other errs', function(done) {
      expect(error.is4XX(null)).to.be.false();
      expect(error.is4XX(new Error())).to.be.false();
      expect(error.is4XX(Boom.badImplementation('boom'))).to.be.false();
      done();
    });
  });
});
