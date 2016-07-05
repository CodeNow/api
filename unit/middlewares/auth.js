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
var UserWhitelist = require('models/mongo/user-whitelist')

describe('middlewares/auth', function () {
  var req
  var res
  var next
  var accessToken = '1234'
  beforeEach(function (done) {
    req = {
      logout: sinon.stub()
    }
    keypather.set(req, 'sessionUser.accounts.github.accessToken', accessToken)
    res = {}
    next = sinon.stub()
    sinon.stub(UserWhitelist, 'getWhitelistedUsersForGithubUserAsync').resolves()
    done()
  })
  afterEach(function (done) {
    UserWhitelist.getWhitelistedUsersForGithubUserAsync.restore()
    done()
  })

  describe('requireWhitelist', function () {
    describe('when we get access token failure', function () {
      var accessTokenError = new Error('An access token must be provided')
      beforeEach(function (done) {
        UserWhitelist.getWhitelistedUsersForGithubUserAsync.rejects(accessTokenError)
        done()
      })
      it('should log the user out and throw unauthorized error', function (done) {
        authMiddleware.requireWhitelist(req, res, next)
          .catch(function (err) {
            expect(err.isBoom).to.be.true
            expect(err.output.statusCode).to.equal(401)
            expect(err.message).to.contain('access token')
          })
          .then(function () {
            sinon.assert.calledOnce(UserWhitelist.getWhitelistedUsersForGithubUserAsync)
            sinon.assert.calledWith(UserWhitelist.getWhitelistedUsersForGithubUserAsync, accessToken)
            sinon.assert.calledOnce(req.logout)
            sinon.assert.calledOnce(next)
          })
          .asCallback(done)
      })
    })
    describe('when we get no records', function () {
      beforeEach(function (done) {
        UserWhitelist.getWhitelistedUsersForGithubUserAsync.resolves([])
        done()
      })
      it('should throw unauthorized error', function (done) {
        authMiddleware.requireWhitelist(req, res, next)
          .catch(function (err) {
            expect(err.isBoom).to.be.true
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
        UserWhitelist.getWhitelistedUsersForGithubUserAsync.resolves([{}])
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
