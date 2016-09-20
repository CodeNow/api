/**
 * @module unit/models/apis/cream
 */
'use strict'
require('loadenv')()

const Promise = require('bluebird')
var Code = require('code')
var Lab = require('lab')
const sinon = require('sinon')
require('sinon-as-promised')(Promise)

const request = require('request')

const CreamAPI = require('models/apis/cream')

const lab = exports.lab = Lab.script()
const describe = lab.describe
const beforeEach = lab.beforeEach
const afterEach = lab.afterEach
const expect = Code.expect
const it = lab.it

let _makeRequestStub

const stub_makeRequest = function (done) {
  _makeRequestStub = sinon.stub(CreamAPI, '_makeRequest').resolves()
  done()
}
const restore_makeRequestStub = function (done) {
  _makeRequestStub.restore()
  done()
}

describe('Cream API', function () {
  const organizationId = 1
  const stripeToken = 'tok_2342389232'
  const ownerBigPoppaId = 2
  const userEmail = 'jorge@runnable.com'

  describe('#getPlanForOrganization', function () {
    beforeEach(stub_makeRequest)
    afterEach(restore_makeRequestStub)

    it('should call the `_makeRequest` function', function (done) {
      CreamAPI.getPlanForOrganization(organizationId)
        .then(function () {
          sinon.assert.calledOnce(_makeRequestStub)
          sinon.assert.calledWithExactly(_makeRequestStub, 'plan', organizationId)
        })
        .asCallback(done)
    })
  })

  describe('#getInvoicesForOrganization', function () {
    beforeEach(stub_makeRequest)
    afterEach(restore_makeRequestStub)
    it('should call the `_makeRequest` function', function (done) {
      CreamAPI.getInvoicesForOrganization(organizationId)
        .then(function () {
          sinon.assert.calledOnce(_makeRequestStub)
          sinon.assert.calledWithExactly(_makeRequestStub, 'invoices', organizationId)
        })
        .asCallback(done)
    })
  })

  describe('#getPaymentMethodForOrganization', function () {
    beforeEach(stub_makeRequest)
    afterEach(restore_makeRequestStub)

    it('should call the `_makeRequest` function', function (done) {
      CreamAPI.getPaymentMethodForOrganization(organizationId)
        .then(function () {
          sinon.assert.calledOnce(_makeRequestStub)
          sinon.assert.calledWithExactly(_makeRequestStub, 'payment-method', organizationId)
        })
        .asCallback(done)
    })
  })

  describe('#postPaymentMethodForOrganization', function () {
    beforeEach(stub_makeRequest)
    afterEach(restore_makeRequestStub)

    it('should call the `_makeRequest` function', function (done) {
      CreamAPI.postPaymentMethodForOrganization(organizationId, stripeToken, ownerBigPoppaId, userEmail)
        .then(function () {
          sinon.assert.calledOnce(_makeRequestStub)
          sinon.assert.calledWithExactly(_makeRequestStub, 'payment-method', organizationId, {
            stripeToken: stripeToken,
            user: {
              id: ownerBigPoppaId,
              email: userEmail
            }
          })
        })
        .asCallback(done)
    })
  })

  describe('#_makeRequest', function () {
    let requestStub
    let response
    const path = 'invoices'
    beforeEach(function (done) {
      response = {
        statusCode: 200,
        body: JSON.stringify({ hello: 'world' })
      }
      requestStub = sinon.stub(request, 'Request', function (params) {
        return params.callback(null, response)
      })
      done()
    })
    afterEach(function (done) {
      requestStub.restore()
      done()
    })
    it('should call the `resquest` module with the GET `method` and `url`', function (done) {
      CreamAPI._makeRequest(path, organizationId)
        .then(function () {
          sinon.assert.calledOnce(requestStub)
          sinon.assert.calledWith(requestStub, {
            method: 'GET',
            uri: undefined,
            callback: sinon.match.func,
            url: `${process.env.CREAM_HOST}/organization/${organizationId}/${path}`
          })
        })
        .asCallback(done)
    })

    it('should call the `resquest` module with the POST `method`, `body` and `url` if body is passed', function (done) {
      let body = {}
      return CreamAPI._makeRequest(path, organizationId, body)
        .then(function () {
          sinon.assert.calledOnce(requestStub)
          sinon.assert.calledWith(requestStub, {
            method: 'POST',
            url: `${process.env.CREAM_HOST}/organization/${organizationId}/${path}`,
            uri: undefined,
            callback: sinon.match.func,
            body: body,
            json: true
          })
        })
        .asCallback(done)
    })

    it('should throw an regular error if a 500 status code error is received', function (done) {
      response = {
        statusCode: 500
      }
      CreamAPI._makeRequest(path, organizationId)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/cream.*error/i)
          done()
        })
    })

    it('should throw an notFound error if a 404 status code error is received', function (done) {
      var errorMessage = 'No payment method'
      response = {
        statusCode: 404,
        body: {
          message: errorMessage
        }
      }
      CreamAPI._makeRequest(path, organizationId)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.output.statusCode).to.equal(404)
          expect(err.data.err.message).to.equal(errorMessage)
          expect(err.message).to.match(/cream.*not.*found/i)
          expect(err.message).to.match(/payment.*method/i)
          done()
        })
    })

    it('should throw an bad request error if a 400 status code error is received', function (done) {
      var errorMessage = 'superString'
      response = {
        statusCode: 400,
        body: {
          message: errorMessage
        }
      }
      CreamAPI._makeRequest(path, organizationId)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.output.statusCode).to.equal(400)
          expect(err.data.err.message).to.equal(errorMessage)
          expect(err.message).to.match(/cream.*bad.*request/i)
          expect(err.message).to.match(/super/i)
          done()
        })
    })

    it('should return the object if an object is returned', function (done) {
      let responseBody = { hello: 'world' }
      response = {
        statusCode: 200,
        body: responseBody
      }
      CreamAPI._makeRequest(path, organizationId)
        .then(function (res) {
          expect(res).to.equal(responseBody)
        })
        .asCallback(done)
    })

    it('should return a parsed object if a JSON object is received', function (done) {
      let obj = { hello: 'world' }
      let responseBody = JSON.stringify(obj)
      response = {
        statusCode: 200,
        body: responseBody
      }
      CreamAPI._makeRequest(path, organizationId)
        .then(function (res) {
          expect(res).to.deep.equal(obj)
        })
        .asCallback(done)
    })

    it('should return an object with a message if it a JSON object cannot be parsed', function (done) {
      let responseBody = 'hello-world'
      response = {
        statusCode: 200,
        body: responseBody
      }
      CreamAPI._makeRequest(path, organizationId)
        .then(function (res) {
          expect(res).to.be.an.object()
          expect(res.message).to.equal(responseBody)
          expect(res.statusCode).to.equal(response.statusCode)
        })
        .asCallback(done)
    })
  })
})

