'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect

var Timers = require('models/apis/timers')
var uuid = require('uuid')
var createCount = require('callback-count')
var spyOnMethod = require('function-proxy').spyOnMethod

var ctx = {}

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('Timers: ' + moduleName, function () {
  describe('instantiation', function () {
    it('should instantiate a timer', function (done) {
      var t
      try {
        t = new Timers()
      } catch (err) {
        done(err)
      }
      expect(t).to.not.equal(undefined)
      expect(t).to.be.an.object()
      done()
    })
  })

  describe('working with a timer', function () {
    beforeEach(function (done) {
      ctx.timer = new Timers()
      done()
    })
    afterEach(function (done) {
      delete ctx.timer
      delete ctx.timerName
      done()
    })
    describe('starting timers', function () {
      it('should start a timer', function (done) {
        ctx.timer.startTimer(uuid(), done)
      })
      it('should fail without a name', function (done) {
        ctx.timer.startTimer(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/require a name/)
          done()
        })
      })
    })
    describe('started timers', function () {
      beforeEach(function (done) {
        ctx.timerName = uuid()
        ctx.timer.startTimer(ctx.timerName, done)
      })
      it('should start another timer', function (done) {
        ctx.timer.startTimer(uuid(), done)
      })
      it('should fail without a name', function (done) {
        ctx.timer.startTimer(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/require a name/)
          done()
        })
      })
      it('should fail with a duplicate name', function (done) {
        ctx.timer.startTimer(ctx.timerName, function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/already exists/)
          done()
        })
      })
    })
    describe('stopping timers', function () {
      beforeEach(function (done) {
        ctx.timerName = uuid()
        ctx.spyCalled = false
        ctx.spyTags = null
        spyOnMethod(require('models/datadog'), 'timing',
          function (name, value, tags) {
            ctx.spyCalled = name
            ctx.spyTags = tags
          })
        ctx.timer.startTimer(ctx.timerName, done)
      })
      it('should stop a timer', function (done) {
        var count = createCount(2, done)
        ctx.timer_debug = ctx.timer.debug
        ctx.timer.debug = function () {
          expect(arguments[0]).to.equal(ctx.timerName)
          expect(arguments[1]).to.match(/\d+s, \d?\.?\d+ms/)
          ctx.timer.debug = ctx.timer_debug
          ctx.timer.debug.apply(ctx.timer, arguments)
          count.next()
        }
        ctx.timer.stopTimer(ctx.timerName, count.next)
      })
      it('should fail without a name', function (done) {
        ctx.timer.stopTimer(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/require a name/)
          done()
        })
      })
      it('should fail with a name that does not exist', function (done) {
        ctx.timer.stopTimer(uuid(), function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/does not exist/)
          done()
        })
      })
      it('should send datadog a message', function (done) {
        ctx.timer.stopTimer(ctx.timerName, function (err) {
          if (err) { return done(err) }
          var r = new RegExp('api.timers.' + ctx.timerName)
          expect(ctx.spyCalled).to.match(r)
          expect(ctx.spyTags.length).to.equal(1)
          expect(ctx.spyTags).to.contain('node_env:test')
          done()
        })
      })
      it('should send additional tags to datadog', function (done) {
        ctx.timer.stopTimer(ctx.timerName, ['value:1'], function (err) {
          if (err) { return done(err) }
          var r = new RegExp('api.timers.' + ctx.timerName)
          expect(ctx.spyCalled).to.match(r)
          expect(ctx.spyTags.length).to.equal(2)
          expect(ctx.spyTags).to.contain('node_env:test')
          expect(ctx.spyTags).to.contain('value:1')
          done()
        })
      })
    })
    describe('stopped timers', function () {
      beforeEach(function (done) {
        ctx.timerName = uuid()
        ctx.timer.startTimer(ctx.timerName, done)
      })
      beforeEach(function (done) {
        ctx.timer.stopTimer(ctx.timerName, done)
      })
      it('should be able to start with the same name', function (done) {
        ctx.timer.startTimer(ctx.timerName, done)
      })
      it('should not stop again', function (done) {
        ctx.timer.stopTimer(ctx.timerName, function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/does not exist/)
          done()
        })
      })
    })
  })
})
