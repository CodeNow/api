'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var expect = require('code').expect
var it = lab.it
var beforeEach = lab.beforeEach

var redis = require('models/redis')
var Token = require('models/redis/token')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('token.js unit test ' + moduleName, function () {
  var token
  beforeEach(function (done) {
    redis.flushdb(done)
  })
  beforeEach(function (done) {
    token = new Token()
    done()
  })
  describe('getKey', function () {
    it('should return key used for redis', function (done) {
      var testValue = token.getKey()
      expect(testValue).to.equal(token.key)
      done()
    })
  })
  describe('setValue', function () {
    it('should set value to random token', function (done) {
      var testValue = 'whodatvaluewannabeatrunnable'
      token.setValue(testValue, function (err) {
        if (err) { return done(err) }
        redis.lpop(token.getKey(), function (err, value) {
          if (err) { return done(err) }
          expect(value).to.equal(testValue)
          done()
        })
      })
    })
  })
})
