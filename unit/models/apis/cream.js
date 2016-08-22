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

let _makeReuestStub

const stub_makeReuest = (done) => {
  _makeReuestStub = sinon.stub(CreamAPI, '_makeReuest').resolves()
  done()
}
const restore_makeReuestStub = (done) => {
  _makeReuestStub.restore()
  done()
}

describe('Cream API', function () {
  const organizationId = 1
  const stripeToken = 'tok_2342389232'
  const ownerBigPoppaId = 2

  describe('#getPlanForOrganization', () => {
    beforeEach(stub_makeReuest)
    afterEach(restore_makeReuestStub)

    it('should call the `_makeReuest` function', () => {
      return CreamAPI.getPlanForOrganization(organizationId)
        .then(() => {
          sinon.assert.calledOnce(_makeReuestStub)
          sinon.assert.calledWithExactly(_makeReuestStub, 'plan', organizationId)
        })
    })
  })

  describe('#getInvoicesForOrganization', () => {
    beforeEach(stub_makeReuest)
    afterEach(restore_makeReuestStub)

    it('should call the `_makeReuest` function', () => {
      return CreamAPI.getInvoicesForOrganization(organizationId)
        .then(() => {
          sinon.assert.calledOnce(_makeReuestStub)
          sinon.assert.calledWithExactly(_makeReuestStub, 'invoices', organizationId)
        })
    })
  })

  describe('#getPaymentMethodForOrganization', () => {
    beforeEach(stub_makeReuest)
    afterEach(restore_makeReuestStub)

    it('should call the `_makeReuest` function', () => {
      return CreamAPI.getPaymentMethodForOrganization(organizationId)
        .then(() => {
          sinon.assert.calledOnce(_makeReuestStub)
          sinon.assert.calledWithExactly(_makeReuestStub, 'payment-method', organizationId)
        })
    })
  })

  describe('#postPaymentMethodForOrganization', () => {
    beforeEach(stub_makeReuest)
    afterEach(restore_makeReuestStub)

    it('should call the `_makeReuest` function', () => {
      return CreamAPI.postPaymentMethodForOrganization(organizationId, stripeToken, ownerBigPoppaId)
        .then(() => {
          sinon.assert.calledOnce(_makeReuestStub)
          sinon.assert.calledWithExactly(_makeReuestStub, 'payment-method', organizationId, {
            stripeToken: stripeToken,
            user: {
              id: ownerBigPoppaId
            }
          })
        })
    })
  })

  describe('#_makeReuest', () => {
    let requestStub
    let response
    const path = 'invoices'
    beforeEach(done => {
      response = {
        statusCode: 200,
        body: JSON.stringify({ hello: 'world' })
      }
      requestStub = sinon.stub(request, 'Request', params => {
        return params.callback(null, response)
      })
      done()
    })
    afterEach(done => {
      requestStub.restore()
      done()
    })
    it('should call the `resquest` module with the GET `method` and `url`', () => {
      return CreamAPI._makeReuest(path, organizationId)
        .then(() => {
          sinon.assert.calledOnce(requestStub)
          sinon.assert.calledWith(requestStub, {
            method: 'GET',
            uri: undefined,
            callback: sinon.match.func,
            url: `${process.env.CREAM_HOST}/organization/${organizationId}/${path}`
          })
        })
    })

    it('should call the `resquest` module with the POST `method`, `body` and `url` if body is passed', () => {
      let body = {}
      return CreamAPI._makeReuest(path, organizationId, body)
        .then(() => {
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
    })

    it('should throw an regular error if a 500 status code error is received', done => {
      response = {
        statusCode: 500
      }
      CreamAPI._makeReuest(path, organizationId)
        .asCallback(err => {
          expect(err).to.exist()
          expect(err.message).to.match(/cream.*error/i)
          done()
        })
    })

    it('should throw an bad request error if a 400 status code error is received', done => {
      response = {
        statusCode: 400
      }
      CreamAPI._makeReuest(path, organizationId)
        .asCallback(err => {
          expect(err).to.exist()
          expect(err.output.statusCode).to.equal(400)
          expect(err.message).to.match(/cream.*bad.*request/i)
          done()
        })
    })

    it('should return the object if an object is returned', () => {
      let responseBody = { hello: 'world' }
      response = {
        statusCode: 200,
        body: responseBody
      }
      return CreamAPI._makeReuest(path, organizationId)
        .then(res => {
          expect(res).to.equal(responseBody)
        })
    })

    it('should return a parsed object if a JSON object is received', () => {
      let obj = { hello: 'world' }
      let responseBody = JSON.stringify(obj)
      response = {
        statusCode: 200,
        body: responseBody
      }
      return CreamAPI._makeReuest(path, organizationId)
        .then(res => {
          expect(res).to.deep.equal(obj)
        })
    })

    it('should return an object with a message if it a JSON object cannot be parsed', () => {
      let responseBody = 'hello-world'
      response = {
        statusCode: 200,
        body: responseBody
      }
      return CreamAPI._makeReuest(path, organizationId)
        .then(res => {
          expect(res).to.be.an.object()
          expect(res.message).to.equal(responseBody)
          expect(res.statusCode).to.equal(response.statusCode)
        })
    })
  })
})

