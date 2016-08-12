'use strict'
require('loadenv')()

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach

var expect = require('code').expect
var keypather = require('keypather')()
var sinon = require('sinon')
require('sinon-as-promised')(require('bluebird'))

var UserService = require('models/services/user-service')

var BigPoppaClient = require('@runnable/big-poppa-client')
var Github = require('models/apis/github')

describe('User Service', function () {
  describe('getUser', function () {
    var model = { id: '2' }
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(BigPoppaClient.prototype, 'getUsers').resolves([model])
        done()
      })

      afterEach(function (done) {
        BigPoppaClient.prototype.getUsers.restore()
        done()
      })

      it('should resolve an owner', function (done) {
        UserService.getUser({ github: model })
          .tap(function (checkedModel) {
            expect(checkedModel).to.equal(model)
            sinon.assert.calledOnce(BigPoppaClient.prototype.getUsers)
            sinon.assert.calledWith(BigPoppaClient.prototype.getUsers, {
              githubId: '2'
            })
          })
          .asCallback(done)
      })
    })
    describe('fail', function () {
      var error = new Error('This is an error')
      beforeEach(function (done) {
        sinon.stub(BigPoppaClient.prototype, 'getUsers').rejects(error)
        done()
      })

      afterEach(function (done) {
        BigPoppaClient.prototype.getUsers.restore()
        done()
      })
      it('should reject if getUsers fails', function (done) {
        UserService.getUser({ github: model })
          .asCallback(function (err) {
            expect(err).to.equal(error)
            done()
          })
      })
    })
  })

  describe('isUserPartOfOrg', function () {
    var orgGithubId = '232323'
    var user = {}
    var userGithubId = '1111'
    keypather.set(user, 'accounts.github.id', userGithubId)
    var bigPoppaUser = {
      organizations: []
    }
    var bigPoppaOrg = {
      githubId: orgGithubId
    }
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(UserService, 'getByGithubId').resolves(bigPoppaUser)
        done()
      })

      afterEach(function (done) {
        UserService.getByGithubId.restore()
        done()
      })

      it('should resolve when the user has no orgs', function (done) {
        UserService.isUserPartOfOrg(user, orgGithubId)
          .spread(function (orgExists, user) {
            expect(orgExists).to.be.false()
            sinon.assert.calledOnce(UserService.getByGithubId)
            expect(user).to.equal(bigPoppaUser)
          })
          .asCallback(done)
      })

      it('should resolve when the user has the org', function (done) {
        bigPoppaUser.organizations.push(bigPoppaOrg)
        UserService.isUserPartOfOrg(user, orgGithubId)
          .spread(function (orgExists, user) {
            expect(orgExists).to.be.true()
            sinon.assert.calledOnce(UserService.getByGithubId)
            expect(user).to.equal(bigPoppaUser)
          })
          .asCallback(done)
      })
    })
    describe('fail', function () {
      var error = new Error('This is an error')
      beforeEach(function (done) {
        sinon.stub(UserService, 'getByGithubId').rejects(error)
        done()
      })

      afterEach(function (done) {
        UserService.getByGithubId.restore()
        done()
      })
      it('should reject if getUser fails', function (done) {
        bigPoppaUser.organizations.push(bigPoppaOrg)
        UserService.isUserPartOfOrg(user, orgGithubId)
          .asCallback(function (err) {
            expect(err).to.equal(error)
            done()
          })
      })
    })
  })

  describe('getUsersOrganizations', function () {
    var orgGithubId = '232323'
    var orgGithubName = 'bigPoppa'
    var user = {}
    var userGithubId = '1111'
    keypather.set(user, 'accounts.github.id', userGithubId)
    var bigPoppaUser = {
      organizations: []
    }
    var bigPoppaOrg = {
      githubId: orgGithubId
    }
    var githubOrg = {
      id: orgGithubId,
      login: orgGithubName
    }
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(Github.prototype, 'getUserAuthorizedOrgsAsync')
        sinon.stub(UserService, 'getUser').resolves(bigPoppaUser)
        done()
      })

      afterEach(function (done) {
        UserService.getUser.restore()
        Github.prototype.getUserAuthorizedOrgsAsync.restore()
        done()
      })

      it('should resolve when the user has no orgs', function (done) {
        Github.prototype.getUserAuthorizedOrgsAsync.resolves([])
        UserService.getUsersOrganizations(user)
          .then(function (orgs) {
            expect(orgs).to.be.have.length(0)
            sinon.assert.calledOnce(UserService.getUser)
          })
          .asCallback(done)
      })

      it('should resolve when the user has the org', function (done) {
        Github.prototype.getUserAuthorizedOrgsAsync.resolves([ githubOrg ])
        bigPoppaUser.organizations.push(bigPoppaOrg)
        UserService.getUsersOrganizations(user)
          .then(function (orgs) {
            expect(orgs).to.be.have.length(1)
            expect(orgs[0]).to.equal(bigPoppaOrg)
            sinon.assert.calledOnce(UserService.getUser)
            sinon.assert.calledOnce(Github.prototype.getUserAuthorizedOrgsAsync)
          })
          .asCallback(done)
      })
      it('should resolve when the user has more github orgs than bigPoppaOrgs', function (done) {
        var fakeOrg = {
          id: 1,
          login: 'fakeOrg'
        }
        bigPoppaUser.organizations.push(bigPoppaOrg)
        Github.prototype.getUserAuthorizedOrgsAsync.resolves([ githubOrg, fakeOrg ])
        UserService.getUsersOrganizations(user)
          .then(function (orgs) {
            expect(orgs).to.be.have.length(1)
            expect(orgs[0]).to.equal(bigPoppaOrg)
            sinon.assert.calledOnce(UserService.getUser)
            sinon.assert.calledOnce(Github.prototype.getUserAuthorizedOrgsAsync)
          })
          .asCallback(done)
      })
    })
    describe('fail', function () {
      var error = new Error('This is an error')
      beforeEach(function (done) {
        sinon.stub(Github.prototype, 'getUserAuthorizedOrgsAsync').rejects(error)
        sinon.stub(UserService, 'getUser').resolves(bigPoppaUser)
        done()
      })

      afterEach(function (done) {
        UserService.getUser.restore()
        Github.prototype.getUserAuthorizedOrgsAsync.restore()
        done()
      })
      it('should reject if github fails', function (done) {
        bigPoppaUser.organizations.push(bigPoppaOrg)
        UserService.getUsersOrganizations(user)
          .asCallback(function (err) {
            expect(err).to.equal(error)
            done()
          })
      })
    })
  })
})
