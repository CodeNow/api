/**
 * @module unit/routes/billing
 */
'use strict'
require('loadenv')()

const Promise = require('bluebird')
const Lab = require('lab')
const sinon = require('sinon')
require('sinon-as-promised')(Promise)

const responseHandler = require('routes/billing').responseHandler

const lab = exports.lab = Lab.script()
const describe = lab.describe
const beforeEach = lab.beforeEach
const it = lab.it

describe('/billing', function () {
  describe('#responseHandler', function () {
    var nextStub
    var resStub
    beforeEach(function (done) {
      nextStub = sinon.stub()
      resStub = {
        json: sinon.stub()
      }
      done()
    })
    it('should call `next` if theres an error', function (done) {
      var err = new Error('hello')
      responseHandler(resStub, nextStub, err, {})
      sinon.assert.notCalled(resStub.json)
      sinon.assert.calledOnce(nextStub)
      sinon.assert.calledWithExactly(nextStub, err)
      done()
    })

    it('should call `res.json` if theres no error', function (done) {
      var obj = {}
      responseHandler(resStub, nextStub, null, obj)
      sinon.assert.calledOnce(resStub.json)
      sinon.assert.calledWithExactly(resStub.json, obj)
      sinon.assert.notCalled(nextStub)
      done()
    })
  })
})
