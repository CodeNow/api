'use strict'
require('loadenv')()

const Promise = require('bluebird')
const Lab = require('lab')
const sinon = require('sinon')
const Code = require('code')
require('sinon-as-promised')(Promise)

const PromsieResponseHandler = require('routes/promise-response-handler')

const lab = exports.lab = Lab.script()
const describe = lab.describe
const beforeEach = lab.beforeEach
const expect = Code.expect
const it = lab.it

describe('PromsieResponseHandler', function () {
  let resMock
  let nextStub
  beforeEach(function (done) {
    nextStub = sinon.stub()
    resMock = {
      status: sinon.stub().returnsThis(),
      end: sinon.stub().returnsThis(),
      json: sinon.stub().returnsThis()
    }
    done()
  })
  describe('responseHandler', function () {
    it('should call next if theres an error', function (done) {
      let error = new Error()
      PromsieResponseHandler.responseHandler(resMock, nextStub, error, {})
      sinon.assert.calledOnce(nextStub)
      sinon.assert.calledWith(nextStub, error)
      sinon.assert.notCalled(resMock.end)
      done()
    })

    it('should call status if theres no error and there is a status', function (done) {
      PromsieResponseHandler.responseHandler(resMock, nextStub, null, { status: 200 })
      sinon.assert.calledOnce(resMock.status)
      sinon.assert.calledWith(resMock.status, 200)
      done()
    })

    it('should call json if theres no error and there is a json', function (done) {
      let json = { a: 1 }
      PromsieResponseHandler.responseHandler(resMock, nextStub, null, { json })
      sinon.assert.calledOnce(resMock.json)
      sinon.assert.calledWith(resMock.json, json)
      done()
    })

    it('should always call end if there is no error', function (done) {
      PromsieResponseHandler.responseHandler(resMock, nextStub, null, {})
      sinon.assert.notCalled(nextStub)
      sinon.assert.calledOnce(resMock.end)
      done()
    })
  })

  describe('jsonResponseHanlder', function () {
    it('should call next if theres an error', function (done) {
      let error = new Error()
      PromsieResponseHandler.jsonResponseHanlder(resMock, nextStub, error, {})
      sinon.assert.calledOnce(nextStub)
      sinon.assert.calledWith(nextStub, error)
      sinon.assert.notCalled(resMock.json)
      done()
    })

    it('should call json if theres no error and there is a json', function (done) {
      let json = { a: 1 }
      PromsieResponseHandler.jsonResponseHanlder(resMock, nextStub, null, json)
      sinon.assert.calledOnce(resMock.json)
      sinon.assert.calledWith(resMock.json, json)
      done()
    })
  })
})
