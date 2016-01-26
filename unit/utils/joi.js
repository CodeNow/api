'use strict'

var async = require('async')
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
      sinon.spy(joi, 'validate')
      ctx.data = {
        foo: 1,
        bar: 1
      }
      ctx.schema = joi.object().keys({
        foo: joi.number().required(),
        bar: joi.number().required()
      })
      done()
    })

    afterEach(function (done) {
      joi.validate.restore()
      done()
    })

    describe('valid data', function () {
      beforeEach(function (done) {
        ctx.validData = {}
        done()
      })

      it('should validate with joi', function (done) {
        var opts = {}
        joi.validateOrBoom(ctx.data, ctx.schema, opts, function (err, validData) {
          if (err) { return done(err) }
          sinon.assert.calledOnce(joi.validate)
          sinon.assert.calledWithExactly(
            joi.validate,
            ctx.data,
            ctx.schema,
            opts,
            sinon.match.func
          )
          expect(validData).to.deep.equal(ctx.data)
          done()
        })
      })

      it('should validate w/out cb', function (done) {
        // this test is for coverage
        var opts = {}
        joi.validateOrBoom(ctx.data, ctx.schema, opts)
        async.until(
          function () { return joi.validate.called },
          function (cb) { setTimeout(function () { cb() }, 10) },
          function (err) {
            if (err) { return done(err) }
            sinon.assert.calledOnce(joi.validate)
            done()
          }
        )
      })
    })

    describe('errors', function () {
      it('should callback badRequest err if data is null', function (done) {
        var opts = {}
        joi.validateOrBoom(null, ctx.schema, opts, function (err) {
          expect(err.isBoom).to.be.true()
          expect(err.message).to.match(/value.+object/)
          expect(err.output.statusCode).to.equal(400)
          done()
        })
      })

      // this is to prevent any weird pre-check before joi
      it('should callback with modified label if provided', function (done) {
        ctx.schema = ctx.schema.label('data')
        joi.validateOrBoom(null, ctx.schema, {}, function (err) {
          expect(err.isBoom).to.be.true()
          expect(err.message).to.match(/data.+object/)
          expect(err.output.statusCode).to.equal(400)
          done()
        })
      })

      it('should callback badRequest err if required data is undefined', function (done) {
        // this is a werid test because `undefined` is an object, evidently.
        // make the schema required.
        joi.validateOrBoom(undefined, ctx.schema.required(), {}, function (err) {
          expect(err).to.exist()
          expect(err.isBoom).to.be.true()
          expect(err.message).to.match(/value.+required/)
          expect(err.output.statusCode).to.equal(400)
          done()
        })
      })

      describe('unknown error', function () {
        beforeEach(function (done) {
          joi.validate.restore()
          ctx.err = new Error('boom')
          sinon.stub(joi, 'validate').yieldsAsync(ctx.err)
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
