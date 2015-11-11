'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var after = lab.after
var Code = require('code')
var expect = Code.expect

var createCount = require('callback-count')
var RedisMutex = require('models/redis/mutex')
var redis = require('models/redis')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('RedisMutex: ' + moduleName, function () {
  before(function (done) {
    redis.flushdb(done)
  })
  after(function (done) {
    redis.flushdb(done)
  })

  var ctx = {}

  describe('lock', function () {
    it('should lock', function (done) {
      var mutex = new RedisMutex('key-1')
      mutex.lock(function (err, success) {
        if (err) { return done(err) }
        expect(success).to.equal(true)
        done()
      })
    })

    it('should fail to lock with the same key', function (done) {
      var mutex = new RedisMutex('key-1')
      mutex.lock(function (err, success) {
        if (err) { return done(err) }
        expect(success).to.equal(false)
        done()
      })
    })

    describe('unlock', function () {
      it('should be able to lock after unlock', function (done) {
        var mutex = new RedisMutex('key-1')
        mutex.unlock(function (err, success) {
          if (err) { return done(err) }
          expect(success).to.equal('1')
          mutex.lock(function (err, success) {
            if (err) { return done(err) }
            expect(success).to.equal(true)
            done()
          })
        })
      })
    })

    describe('ttl', function () {
      before(function (done) {
        ctx.originREDIS_LOCK_EXPIRES = process.env.REDIS_LOCK_EXPIRES
        done()
      })
      after(function (done) {
        process.env.REDIS_LOCK_EXPIRES = ctx.originREDIS_LOCK_EXPIRES
        done()
      })

      it('should release lock after expiration time', function (done) {
        var count = createCount(2, done)
        process.env.REDIS_LOCK_EXPIRES = 50
        var mutex1 = new RedisMutex('new-key-1')
        var mutex2 = new RedisMutex('new-key-1')
        setTimeout(function () {
          mutex2.lock(function (err, success) {
            if (err) { return done(err) }
            expect(success).to.equal(true)
            count.next()
          })
        }, 100)
        mutex1.lock(function (err, success) {
          if (err) { return done(err) }
          expect(success).to.equal(true)
          mutex2.lock(function (err, success) {
            if (err) { return done(err) }
            expect(success).to.equal(false)
            count.next()
          })
        })
      })
    })
  })
})
