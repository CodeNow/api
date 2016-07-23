'use strict'

require('loadenv')()

var Code = require('code')
var keypather = require('keypather')()
var Lab = require('lab')
var Promise = require('bluebird')
var sinon = require('sinon')

require('sinon-as-promised')(Promise)
var lab = exports.lab = Lab.script()

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var it = lab.it
var expect = Code.expect

var authMiddleware = require('middlewares/auth')
var UserService = require('models/services/user-service')

describe('middlewares/auth', function () {
  var req
  var res
  var next
  var githubId = 1234
  beforeEach(function (done) {
    req = {
      logout: sinon.stub()
    }
    keypather.set(req, 'sessionUser.accounts.github.id', githubId)
    res = {}
    next = sinon.stub()
    sinon.stub(UserService, 'getAllUserOrganizationsByAccessToken').resolves()
    done()
  })
  afterEach(function (done) {
    UserService.getAllUserOrganizationsByAccessToken.restore()
    done()
  })

  describe('requireWhitelist', function () {
    describe('when we get no records', function () {
      beforeEach(function (done) {
        UserService.getAllUserOrganizationsByAccessToken.resolves({ orgs: [] })
        done()
      })
      it('should throw unauthorized error', function (done) {
        authMiddleware.requireWhitelist(req, res, next)
          .catch(function (err) {
            expect(err.isBoom).to.be.true()
            expect(err.output.statusCode).to.equal(401)
            expect(err.message).to.contain('not part of an organization')
          })
          .then(function () {
            sinon.assert.notCalled(req.logout)
            sinon.assert.calledOnce(next)
          })
          .asCallback(done)
      })
    })
    describe('when we get records', function () {
      beforeEach(function (done) {
        UserService.getAllUserOrganizationsByAccessToken.resolves({ orgs: [{}] })
        done()
      })
      it('should throw unauthorized error', function (done) {
        authMiddleware.requireWhitelist(req, res, next)
          .then(function () {
            sinon.assert.notCalled(req.logout)
            sinon.assert.alwaysCalledWithExactly(next, null)
          })
          .asCallback(done)
      })
    })
  })
})
