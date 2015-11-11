'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect
var sinon = require('sinon')

var Build = require('models/mongo/build')

var ctx = {}
var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('Build: ' + moduleName, function () {
  describe('updateCompletedByContextVersionIds', function () {
    beforeEach(function (done) {
      ctx.cvIds = []
      sinon.stub(Build, 'updateBy')
      done()
    })
    afterEach(function (done) {
      Build.updateBy.restore()
      done()
    })
    describe('db success', function () {
      beforeEach(function (done) {
        Build.updateBy.yieldsAsync()
        done()
      })
      it('should update builds to completed by cvIds', function (done) {
        Build.updateCompletedByContextVersionIds(ctx.cvIds, true, function cb (err) {
          if (err) { return done(err) }
          sinon.assert.calledWith(Build.updateBy,
            'contextVersions',
            { $in: ctx.cvIds },
            sinon.match({
              $set: {
                failed: true,
                completed: sinon.match.truthy
              }
            }),
            { multi: true },
            cb
          )
          done()
        })
      })
      it('should udpate build to completed by cvIds (default: failed)', function (done) {
        Build.updateCompletedByContextVersionIds(ctx.cvIds, function cb (err) {
          if (err) { return done(err) }
          sinon.assert.calledWith(Build.updateBy,
            'contextVersions',
            { $in: ctx.cvIds },
            sinon.match({
              $set: {
                failed: false,
                completed: sinon.match.truthy
              }
            }),
            { multi: true },
            cb
          )
          done()
        })
      })
    })
    describe('db err', function () {
      beforeEach(function (done) {
        ctx.err = new Error('boom')
        Build.updateBy.yieldsAsync(ctx.err)
        done()
      })
      it('should callback err if db errs', function (done) {
        Build.updateCompletedByContextVersionIds(ctx.cvIds, function (err) {
          expect(err).to.equal(ctx.err)
          done()
        })
      })
    })
  })
  describe('updateFailedByContextVersionIds', function () {
    beforeEach(function (done) {
      ctx.cvIds = []
      sinon.stub(Build, 'updateCompletedByContextVersionIds')
      done()
    })
    afterEach(function (done) {
      Build.updateCompletedByContextVersionIds.restore()
      done()
    })
    describe('db success', function () {
      beforeEach(function (done) {
        Build.updateCompletedByContextVersionIds.yieldsAsync()
        done()
      })
      it('it should call updateCompletedByContextVersionIds w/ true', function (done) {
        Build.updateFailedByContextVersionIds(ctx.cvIds, function cb (err) {
          if (err) { return done(err) }
          sinon.assert.calledWith(
            Build.updateCompletedByContextVersionIds,
            ctx.cvIds, true, cb
          )
          done()
        })
      })
    })
    describe('db err', function () {
      beforeEach(function (done) {
        ctx.err = new Error('boom')
        Build.updateCompletedByContextVersionIds.yieldsAsync(ctx.err)
        done()
      })
      it('it should call updateCompletedByContextVersionIds w/ true', function (done) {
        Build.updateFailedByContextVersionIds(ctx.cvIds, function (err) {
          expect(err).to.equal(ctx.err)
          done()
        })
      })
    })
  })
})
