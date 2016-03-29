/**
 * @module unit/models/passport-github-token
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var sinon = require('sinon')
var Code = require('code')
var getUser = require('../../test/functional/fixtures/mocks/github/get-user')
var getUserEmails = require('../../test/functional/fixtures/mocks/github/get-user-emails')

var Github = require('models/apis/github')
var PassporGithubToken = require('models/passport-github-token')

var it = lab.it
var describe = lab.describe
var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var expect = Code.expect

describe('Passport Github Token', function () {
  describe('Constructor', function () {
    it('should set `verify` to a function when option are passed', function (done) {
      var func = function () {}
      var passportGithubToken = new PassporGithubToken({}, func)
      expect(passportGithubToken._verify).to.equal(func)
      done()
    })

    it('should set `verify` to a function when no options are passed', function (done) {
      var func = function () {}
      var passportGithubToken = new PassporGithubToken(func)
      expect(passportGithubToken._verify).to.equal(func)
      done()
    })
  })

  describe('Auhenticate', function () {
    var verify
    var passportGithubToken
    var accessToken = '123'
    var req = {
      body: {
        accessToken: accessToken
      }
    }
    var userId = 586

    beforeEach(function (done) {
      sinon.stub(Github.prototype, 'getAuthorizedUser').yieldsAsync(null, getUser(userId))
      sinon.stub(Github.prototype, 'getUserEmails').yieldsAsync(null, getUserEmails())
      done()
    })
    beforeEach(function (done) {
      verify = sinon.stub().yieldsAsync(null, {}, {})
      passportGithubToken = new PassporGithubToken(verify)
      done()
    })
    afterEach(function (done) {
      Github.prototype.getAuthorizedUser.restore()
      Github.prototype.getUserEmails.restore()
      done()
    })

    describe('Validation', function (done) {
      it('should validate if there is no missing field', function (done) {
        passportGithubToken.success = function (user, info) {
          expect(user).to.be.an.object()
          return done()
        }
        passportGithubToken.authenticate(req)
      })

      it('should not validate if a field is missing', function (done) {
        var user = getUser()
        delete user.id
        Github.prototype.getAuthorizedUser.yieldsAsync(null, user)

        passportGithubToken.error = function (err, res) {
          expect(err).to.exist()
          expect(err.message).to.match(/is.*required/)
          return done()
        }
        passportGithubToken.authenticate(req)
      })
    })

    describe('Github API Calls', function (done) {
      it('should get the user from GitHub', function (done) {
        passportGithubToken.success = function (user, info) {
          expect(user).to.be.an.object()
          sinon.assert.calledOnce(Github.prototype.getAuthorizedUser)
          return done()
        }
        passportGithubToken.authenticate(req)
      })

      it('should throw an error if it cant get the Github user', function (done) {
        Github.prototype.getAuthorizedUser.yieldsAsync(new Error('github error'))

        passportGithubToken.error = function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/github.*error/i)
          return done()
        }
        passportGithubToken.authenticate(req)
      })

      it('should get the emails from GitHub', function (done) {
        passportGithubToken.success = function (user, info) {
          expect(user).to.be.an.object()
          sinon.assert.calledOnce(Github.prototype.getAuthorizedUser)
          sinon.assert.calledWith(Github.prototype.getUserEmails, userId)
          return done()
        }
        passportGithubToken.authenticate(req)
      })

      it('should throw an error if it cant get the users emails', function (done) {
        Github.prototype.getUserEmails.yieldsAsync(new Error('github error'))

        passportGithubToken.error = function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/github.*error/i)
          return done()
        }
        passportGithubToken.authenticate(req)
      })
    })

    describe('User Profiles', function (done) {
      it('should verify the user profile', function (done) {
        passportGithubToken.success = function (user, info) {
          expect(user).to.be.an.object()
          sinon.assert.calledOnce(verify)
          sinon.assert.calledWith(verify, accessToken, undefined, sinon.match.object, sinon.match.func)
          return done()
        }
        passportGithubToken.authenticate(req)
      })

      it('should output a correctly formated profile', function (done) {
        passportGithubToken.success = function (user, info) {
          expect(user).to.be.an.object()
          sinon.assert.calledOnce(verify)
          sinon.assert.calledWith(verify, accessToken, undefined, sinon.match({
            id: userId,
            login: sinon.match.string,
            displayName: sinon.match.string,
            accessToken: accessToken,
            profileUrl: sinon.match.string,
            provider: 'github',
            emails: sinon.match.array,
            _json: sinon.match.object,
            _raw: sinon.match.string
          }), sinon.match.func)
          sinon.assert.calledWith(verify, accessToken)
          return done()
        }
        passportGithubToken.authenticate(req)
      })
    })
  })
})
