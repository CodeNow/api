'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var expect = require('code').expect
var it = lab.it

var reqUtils = require('req-utils')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('req-utils.js unit test: ' + moduleName, function () {
  describe('getProtocol', function () {
    it('should return http', function (done) {
      var testReq = {
        headers: {
          host: 'google.com:24'
        }
      }
      var proto = reqUtils.getProtocol(testReq)
      expect(proto).to.equal('http://')
      done()
    })
    it('should return http when port not specified', function (done) {
      var testReq = {
        headers: {
          host: 'google.com'
        }
      }
      var proto = reqUtils.getProtocol(testReq)
      expect(proto).to.equal('http://')
      done()
    })
    it('should return https when port 443', function (done) {
      var testReq = {
        headers: {
          host: 'google.com:443'
        }
      }
      var proto = reqUtils.getProtocol(testReq)
      expect(proto).to.equal('https://')
      done()
    })
  })
})
