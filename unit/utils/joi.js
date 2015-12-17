'use strict'

var Code = require('code')
var Lab = require('lab')
var ObjectId = require('mongoose').Types.ObjectId
var sinon = require('sinon')

var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var expect = Code.expect
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach

var joi = require('utils/joi')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('joi: ' + moduleName, function () {
  var ctx
  beforeEach(function (done) {
    ctx = {}
    done()
  })
  describe('validateOrBoom', function () {
    beforeEach(function (done) {
      sinon.stub(joi, 'validate')
      ctx.data = {
        foo: 1,
        bar: 1
      }
      done()
    })
    afterEach(function (done) {
      joi.validate.restore()
      done()
    })
    describe('valid data', function () {
      beforeEach(function (done) {
        ctx.validData = {}
        joi.validate.yieldsAsync(null, ctx.validData)
        done()
      })

      it('should validate', function (done) {
        var schema = {}
        var opts = {}
        joi.validateOrBoom(ctx.data, schema, opts, function (err, validData) {
          if (err) { return done(err) }
          expect(validData).to.equal(ctx.validData)
          done()
        })
      })
      it('should validate w/out cb', function (done) {
        // this test is for coverage
        var schema = {}
        var opts = {}
        joi.validateOrBoom(ctx.data, schema, opts)
        done()
      })
    })

    describe('errors', function () {
      it('should callback badRequest err if data is null', function (done) {
        var schema = {}
        var opts = {}
        joi.validateOrBoom(null, schema, opts, function (err) {
          expect(err.isBoom).to.be.true()
          expect(err.message).to.match(/Value does not exist/i)
          expect(err.output.statusCode).to.equal(400)
          expect(err.data.err).to.equal(ctx.err)
          done()
        })
      })

      it('should callback badRequest err if data is undefined', function (done) {
        var schema = {}
        var opts = {}
        joi.validateOrBoom(undefined, schema, opts, function (err) {
          expect(err.isBoom).to.be.true()
          expect(err.message).to.match(/Value does not exist/i)
          expect(err.output.statusCode).to.equal(400)
          expect(err.data.err).to.equal(ctx.err)
          done()
        })
      })

      describe('unknown error', function () {
        beforeEach(function (done) {
          ctx.err = new Error('boom')
          joi.validate.yieldsAsync(ctx.err)
          done()
        })

        it('should callback badRequest err', function (done) {
          var schema = {}
          var opts = {}
          joi.validateOrBoom(ctx.data, schema, opts, function (err) {
            expect(err.isBoom).to.be.true()
            expect(err.message).to.match(/invalid data/i)
            expect(err.output.statusCode).to.equal(400)
            expect(err.data.err).to.equal(ctx.err)
            done()
          })
        })
      })
      describe('validation error', function () {
        beforeEach(function (done) {
          ctx.err = new Error('boom')
          ctx.message = '"path" is required'
          ctx.path = 'key.path'
          ctx.err.details = [{
            message: ctx.message,
            path: ctx.path
          }]
          joi.validate.yieldsAsync(ctx.err)
          done()
        })

        it('should callback badRequest err', function (done) {
          var schema = {}
          var opts = {}
          joi.validateOrBoom(ctx.data, schema, opts, function (err) {
            expect(err.isBoom).to.be.true()
            expect(err.message).to.match(new RegExp())
            expect(err.message).to.equal('"key.path" is required')
            expect(err.output.statusCode).to.equal(400)
            expect(err.data.err).to.equal(ctx.err)
            done()
          })
        })
      })
    })
  })

  describe('objectIdString', function () {
    it('should validate an objectId string', function (done) {
      joi.objectIdString().validate('123456789012345678901234', function (err) {
        expect(err).to.not.exist()
        done()
      })
    })
    it('should error for invalid objectId string', function (done) {
      joi.objectId().validate('12345678901234', function (err) {
        expect(err).to.exist()
        expect(err.message).to.match(/ObjectId/)
        done()
      })
    })
  })

  describe('objectId', function () {
    it('should validate an objectId', function (done) {
      joi.objectId().validate(new ObjectId(), function (err) {
        expect(err).to.not.exist()
        done()
      })
    })
    it('should validate an objectId string', function (done) {
      joi.objectId().validate('123456789012345678901234', function (err) {
        expect(err).to.not.exist()
        done()
      })
    })
    it('should error for invalid objectId string', function (done) {
      joi.objectId().validate('12345678901234', function (err) {
        expect(err).to.exist()
        expect(err.message).to.match(/ObjectId/)
        done()
      })
    })
  })
})
