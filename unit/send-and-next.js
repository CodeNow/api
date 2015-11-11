'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var Code = require('code')
var expect = Code.expect

var resSendAndNext = require('middlewares/send-and-next')
var createCount = require('callback-count')
var sinon = require('sinon')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('send-and-next: ' + moduleName, function () {
  it('should call next and send response with status code', function (done) {
    var count = createCount(2, done)
    var req = {}
    var res = {
      sendStatus: function (statusCode) {
        expect(statusCode).to.equal(201)
        count.next()
      }
    }
    resSendAndNext(201)(req, res, count.next)
  })

  it('should call next and send response with status code and body', function (done) {
    var req = {
      user: {
        name: 'anton'
      }
    }
    var res = {}
    res.status = sinon.stub().returns(res)
    res.send = sinon.stub().returns(res)

    resSendAndNext(201, 'user')(req, res, function () {
      // this is `next`
      expect(res.status.calledOnce).to.equal(true)
      expect(res.send.calledOnce).to.equal(true)
      expect(res.status.getCall(0).args).to.deep.equal([201])
      expect(res.send.getCall(0).args).to.deep.equal([{ name: 'anton' }])
      done()
    })
  })
})
