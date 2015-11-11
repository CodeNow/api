/**
 * @module unit/middlewares/owner-is-hello-runnable
 */
'use strict'

require('loadenv')()

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var Code = require('code')
var expect = Code.expect

var ownerIsHelloRunnable = require('middlewares/owner-is-hello-runnable')
var clone = require('101/clone')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('owner-is-hello-runnable unit test: ' + moduleName, function () {
  describe('with hello runnable session user', function () {
    var req = {
      sessionUser: {
        accounts: {
          github: {
            id: process.env.HELLO_RUNNABLE_GITHUB_ID
          }
        }
      }
    }
    it('should next no error if owner on key is not hello runnable', function (done) {
      var testReq = clone(req)
      var testValue = 'cool_user'
      testReq.validKey = testValue
      ownerIsHelloRunnable('validKey')(testReq, {}, function (err) {
        expect(err).to.not.exist()
        done()
      })
    })
    it('should next no error if owner is on model key', function (done) {
      var testReq = clone(req)
      testReq.validKey = process.env.HELLO_RUNNABLE_GITHUB_ID
      ownerIsHelloRunnable('validKey')(testReq, {}, function (err) {
        expect(err).to.not.exist()
        done()
      })
    })
    it('should next no error if owner is not on model key', function (done) {
      ownerIsHelloRunnable('validKey')(req, {}, function (err) {
        expect(err).to.not.exist()
        done()
      })
    })
  })
  describe('with random session user', function () {
    var req = {
      sessionUser: {
        accounts: {
          github: {
            id: 'random_pokemon'
          }
        }
      }
    }
    it('should next error if owner on key is not hello runnable', function (done) {
      var testReq = clone(req)
      var testValue = 'cool_user'
      testReq.validKey = testValue
      ownerIsHelloRunnable('validKey')(testReq, {}, function (err) {
        expect(err.output.statusCode).to.equal(403)
        done()
      })
    })
    it('should next no error if owner is on model key', function (done) {
      var testReq = clone(req)
      testReq.validKey = {
        owner: {
          github: process.env.HELLO_RUNNABLE_GITHUB_ID
        }
      }
      ownerIsHelloRunnable('validKey')(testReq, {}, function (err) {
        expect(err).to.not.exist()
        done()
      })
    })
    it('should next error if owner is not on model key', function (done) {
      ownerIsHelloRunnable('validKey')(req, {}, function (err) {
        expect(err.output.statusCode).to.equal(403)
        done()
      })
    })
  })
})
