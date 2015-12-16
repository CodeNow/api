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
var keyGen = require('key-generator')
var Keypair = require('models/mongo/keypair')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('KeyGenerator: ' + moduleName, function () {
  var ctx
  beforeEach(function (done) {
    ctx = {}
    done()
  })
  beforeEach(function (done) {
    ctx.mockInterval = {}
    ctx.poolSize = keyGen.poolSize
    keyGen.poolSize = 1
    sinon.stub(global, 'setInterval').returns(ctx.mockInterval)
    sinon.stub(global, 'clearInterval')
    done()
  })
  afterEach(function (done) {
    keyGen.poolSize = ctx.poolSize
    global.setInterval.restore()
    global.clearInterval.restore()
    done()
  })

  describe('start', function () {
    describe('never started', function () {
      afterEach(function (done) {
        // reset to stopped
        keyGen.stop(done)
      })

      it('should start the interval', function (done) {
        keyGen.start(function (err) {
          if (err) { return done(err) }
          expect(ctx.poolSize).to.equal(process.env.GITHUB_DEPLOY_KEYS_POOL_SIZE)
          expect(keyGen.timeInterval).to.equal(60 * 1000)
          sinon.assert.calledWith(global.setInterval, sinon.match.func, keyGen.timeInterval)
          done()
        })
      })
    })
  })

  describe('stop', function () {
    describe('stopped', function () {
      it('should just nextTick callback', function (done) {
        keyGen.stop(done)
      })
    })

    describe('started', function () {
      beforeEach(function (done) {
        keyGen.start(done)
      })

      it('should stop generating keys', function (done) {
        keyGen.stop(function (err) {
          if (err) { return done(err) }
          sinon.assert.calledWith(global.clearInterval, ctx.mockInterval)
          done()
        })
      })
    })
  })

  describe('_stopInterval', function () {
    it('should clear interval and emit "stop"', function (done) {
      keyGen.interval = ctx.mockInterval
      keyGen.on('stop', function (err) {
        if (err) { return done(err) }
        expect(keyGen.interval).to.be.undefined()
        sinon.assert.calledWith(global.clearInterval, ctx.mockInterval)
        done()
      })
      keyGen._stopInterval()
    })
  })

  describe('_handleInterval', function () {
    beforeEach(function (done) {
      ctx.timeInterval = keyGen.timeInterval
      keyGen.timeInterval = 0
      done()
    })
    afterEach(function (done) {
      if (keyGen._handleIntervalComplete.restore) {
        keyGen._handleIntervalComplete.restore()
      }
      keyGen.timeInterval = ctx.timeInterval
      Keypair.getRemainingKeypairCount.restore()
      Keypair.createKeypair.restore()
      done()
    })

    describe('no db errors', function () {
      beforeEach(function (done) {
        sinon.stub(Keypair, 'getRemainingKeypairCount').yieldsAsync(null, 0)
        sinon.stub(Keypair, 'createKeypair').yieldsAsync()
        done()
      })

      it('should clear interval and emit "stop"', function (done) {
        sinon.stub(keyGen, '_handleIntervalComplete', function (err) {
          if (err) { return done(err) }
          sinon.assert.calledOnce(Keypair.getRemainingKeypairCount)
          sinon.assert.calledOnce(Keypair.createKeypair)
          done()
        })
        keyGen._handleInterval()
      })
    })

    describe('getRemainingKeypairCount error', function () {
      beforeEach(function (done) {
        ctx.err = new Error()
        sinon.stub(Keypair, 'getRemainingKeypairCount').yieldsAsync(ctx.err)
        sinon.stub(Keypair, 'createKeypair').yieldsAsync()
        done()
      })

      it('should call _handleIntervalComplete w/ err', function (done) {
        sinon.stub(keyGen, '_handleIntervalComplete', function (err) {
          expect(err).to.equal(ctx.err)
          done()
        })
        keyGen._handleInterval()
      })
    })

    describe('createKeypair error', function () {
      beforeEach(function (done) {
        ctx.err = new Error()
        sinon.stub(Keypair, 'getRemainingKeypairCount').yieldsAsync(null, 0)
        sinon.stub(Keypair, 'createKeypair').yieldsAsync(ctx.err)
        done()
      })

      it('should call _handleIntervalComplete w/ err', function (done) {
        sinon.stub(keyGen, '_handleIntervalComplete', function (err) {
          expect(err).to.equal(ctx.err)
          done()
        })
        keyGen._handleInterval()
      })
    })
  })
})
