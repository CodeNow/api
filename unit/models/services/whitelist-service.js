'use strict'

var Code = require('code')
var Github = require('models/apis/github')
var Lab = require('lab')
var orion = require('@runnable/orion')
var Promise = require('bluebird')
var rabbitMQ = require('models/rabbitmq')
var sinon = require('sinon')
var userWhitelist = require('models/mongo/user-whitelist')
var whitelistService = require('models/services/whitelist-service')

var lab = exports.lab = Lab.script()
var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

require('sinon-as-promised')(Promise)

describe('auth/whitelist unit test: ', function () {
  describe('createWhitelist', function () {
    var mockOrgName
    var mockSessionUser
    var mockOrgs
    var mockGithubOrg

    beforeEach(function (done) {
      mockOrgName = 'testOrgName'
      mockSessionUser = {
        accounts: {
          github: {
            accessToken: 'accessToken!'
          }
        }
      }
      mockGithubOrg = {
        login: mockOrgName.toUpperCase(),
        id: 'mockOrgId1234'
      }
      mockOrgs = [
        {
          id: 1234,
          login: 'This is an org name'
        },
        mockGithubOrg
      ]
      done()
    })

    beforeEach(function (done) {
      sinon.stub(Github.prototype, 'getUserAuthorizedOrgsAsync').resolves(mockOrgs)
      sinon.stub(Github.prototype, 'getUserByUsernameAsync').resolves(mockGithubOrg)
      sinon.stub(userWhitelist, 'createAsync').resolves()
      sinon.stub(orion.users, 'create').resolves()
      sinon.stub(rabbitMQ, 'publishASGCreate')
      done()
    })

    afterEach(function (done) {
      Github.prototype.getUserAuthorizedOrgsAsync.restore()
      Github.prototype.getUserByUsernameAsync.restore()
      userWhitelist.createAsync.restore()
      orion.users.create.restore()
      rabbitMQ.publishASGCreate.restore()
      done()
    })

    it('should fail if no org name is passed in', function (done) {
      whitelistService.createWhitelist(null, {})
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.isBoom).to.be.true()
          expect(err.output.statusCode).to.equal(400)
          expect(err.message).to.match(/orgName/)
          done()
        })
    })

    it('should fail if no session user is passed in', function (done) {
      whitelistService.createWhitelist(mockOrgName, null)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.isBoom).to.be.true()
          expect(err.output.statusCode).to.equal(401)
          expect(err.message).to.match(/logged in/)
          done()
        })
    })

    it('should fail if session user does not have a github token', function (done) {
      whitelistService.createWhitelist(mockOrgName, {})
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.isBoom).to.be.true()
          expect(err.output.statusCode).to.equal(401)
          expect(err.message).to.match(/logged in/)
          done()
        })
    })

    it('should fail if the user does not have access to the organization', function (done) {
      Github.prototype.getUserAuthorizedOrgsAsync.resolves([{login: 'Foo'}])
      whitelistService.createWhitelist(mockOrgName, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.isBoom).to.be.true()
          expect(err.output.statusCode).to.equal(401)
          expect(err.message).to.match(/access to this organization/)
          done()
        })
    })

    it('should fail if the user is an administrator and the org does not exist', function (done) {
      Github.prototype.getUserAuthorizedOrgsAsync.resolves([{login: 'CodeNow'}])
      Github.prototype.getUserByUsernameAsync.resolves(undefined)
      whitelistService.createWhitelist(mockOrgName, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.isBoom).to.be.true()
          expect(err.output.statusCode).to.equal(404)
          expect(err.message).to.match(/organization does not exist/)
          done()
        })
    })

    it('should pass if the user does not have access to the organization but is in the CodeNow org', function (done) {
      Github.prototype.getUserAuthorizedOrgsAsync.resolves([{login: 'CodeNow'}])
      Github.prototype.getUserByUsernameAsync.resolves(mockGithubOrg)
      whitelistService.createWhitelist(mockOrgName, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Github.prototype.getUserByUsernameAsync)
          sinon.assert.calledWith(Github.prototype.getUserByUsernameAsync, mockOrgName)
          done()
        })
    })

    it('should create a user whitelist entry with firstDockCreated set to false', function (done) {
      whitelistService.createWhitelist(mockOrgName, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(userWhitelist.createAsync)
          sinon.assert.calledWith(userWhitelist.createAsync, {
            name: mockGithubOrg.login,
            allowed: true,
            githubId: mockGithubOrg.id,
            firstDockCreated: false
          })
          done()
        })
    })

    it('should create a user in intercom', function (done) {
      whitelistService.createWhitelist(mockOrgName, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(orion.users.create)
          sinon.assert.calledWith(orion.users.create, {
            name: mockSessionUser.accounts.github.username,
            email: mockSessionUser.email,
            created_at: new Date(mockSessionUser.created) / 1000 || 0,
            update_last_request_at: true,
            companies: [{
              company_id: mockGithubOrg.login.toLowerCase(),
              name: mockGithubOrg.login,
              remote_created_at: Math.floor(new Date().getTime() / 1000)
            }]
          })
          done()
        })
    })
  })
})
