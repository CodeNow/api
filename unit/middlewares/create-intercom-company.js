'use strict'

require('loadenv')()

var Lab = require('lab')
var keypather = require('keypather')()
var rewire = require('rewire')
var sinon = require('sinon')
var Promise = require('bluebird')

var lab = exports.lab = Lab.script()

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var it = lab.it

var createIntercomCompanyMiddleware = rewire('middlewares/create-intercom-company')

var path = require('path')

describe('middlewares/create-intercom-company unit test: ' + moduleName, function () {

  var mockOrion
  var oldOrion
  var req
  var res
  var next
  beforeEach(function (done) {
    mockOrion = {
      companies: {
        create: sinon.stub().returns(Promise.resolve())
      }
    }
    oldOrion = createIntercomCompanyMiddleware.__get__('orion')
    createIntercomCompanyMiddleware.__set__('orion', mockOrion)
    req = {
      body: {
        name: 'COMPANY_NAME'
      }
    }
    res = {}
    next = sinon.stub()
    done()
  })

  afterEach(function (done) {
    createIntercomCompanyMiddleware.__set__('orion', oldOrion)
    done()
  })

  it('should call orion create company', function (done) {
    createIntercomCompanyMiddleware(req, res, next)
    sinon.assert.calledOnce(mockOrion.companies.create)
    sinon.assert.calledWith(mockOrion.companies.create, {
      company_id: req.body.name.toLowerCase(),
      name: req.body.name,
      remote_created_at: new Date().getTime() / 1000
    })
    sinon.assert.calledOnce(next)
    done()
  })
})
