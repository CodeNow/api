'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var after = lab.after
var Code = require('code')
var expect = Code.expect

var isEnvOn = require('middlewares/is-env-on')
var createCount = require('callback-count')
var noop = require('101/noop')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('is-env-on: ' + moduleName, function () {
  it('should call send response if env doesnot exist', function (done) {
    var count = createCount(2, done)
    var req = {}
    var res = {
      status: function (statusCode) {
        expect(statusCode).to.equal(422)
        count.next()
      },
      send: function (message) {
        expect(message).to.equal('disabled')
        count.next()
      }
    }
    isEnvOn('SOME_NON_EXISTING_ENV', 422, 'disabled')(req, res, noop)
  })

  describe('test falsy env', function () {
    after(function (done) {
      delete process.env.SOME_EXISTING_ENV
      done()
    })

    it('should call send response if env doesnot equal true', function (done) {
      process.env.SOME_EXISTING_ENV = 'false'
      var count = createCount(2, done)
      var req = {}
      var res = {
        status: function (statusCode) {
          expect(statusCode).to.equal(201)
          count.next()
        },
        send: function (message) {
          expect(message).to.equal('turned off')
          count.next()
        }
      }
      isEnvOn('SOME_EXISTING_ENV', 201, 'turned off')(req, res, noop)
    })
  })

  describe('test truthy env', function () {
    after(function (done) {
      delete process.env.SOME_EXISTING_ENV
      done()
    })

    it('should call next and send response with status code and body', function (done) {
      process.env.SOME_EXISTING_ENV = 'true'
      var req = {}
      var res = {
        status: function () {
          throw new Error('Should never happen')
        },
        send: function () {
          throw new Error('Should never happen')
        }
      }
      isEnvOn('SOME_EXISTING_ENV', 403, 'alert')(req, res, done)
    })
  })
})
