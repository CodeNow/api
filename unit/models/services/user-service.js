'use strict'
require('loadenv')()

const errors = require('errors')
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

const UserService = require('models/services/user-service')
const User = require('models/mongo/user')
const rabbitMQ = require('models/rabbitmq')

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
      beforeEach(function (done) {
        sinon.stub(BigPoppaClient.prototype, 'getUsers').resolves([])
        done()
      })

      afterEach(function (done) {
        BigPoppaClient.prototype.getUsers.restore()
        done()
      })
      it('should reject if getUsers returns null', function (done) {
        UserService.getUser({ github: model })
          .asCallback(function (err) {
            expect(err.message).to.equal('User not found')
            done()
          })
      })
    })
  })

  describe('createOrUpdateUser', function () {
    var githubId = 23123
    var accessToken = 'asdasdasdasdasdasd'
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(rabbitMQ, 'publishUserAuthorized').returns()
        done()
      })

      afterEach(function (done) {
        rabbitMQ.publishUserAuthorized.restore()
        done()
      })

      it('should publish a job with `githubId` and `accessToken`', function (done) {
        UserService.createOrUpdateUser(githubId, accessToken)
        sinon.assert.calledOnce(rabbitMQ.publishUserAuthorized)
        sinon.assert.calledWith(rabbitMQ.publishUserAuthorized, {
          accessToken: accessToken,
          githubId: githubId
        })
        done()
      })
    })
  })

  describe('isUserPartOfOrgByGithubId', function () {
    var orgGithubId = '232323'
    var user = {}
    var userGithubId = '1111'
    keypather.set(user, 'accounts.github.id', userGithubId)
    var bigPoppaUser
    var bigPoppaOrg = {
      githubId: orgGithubId
    }
    describe('success', function () {
      beforeEach(function (done) {
        bigPoppaUser = {
          organizations: []
        }
        done()
      })

      it('should resolve when the user has no orgs', function (done) {
        var orgExists = UserService.isUserPartOfOrgByGithubId(bigPoppaUser, orgGithubId)
        expect(orgExists).to.be.false()
        done()
      })

      it('should resolve when the user has the org', function (done) {
        bigPoppaUser.organizations.push(bigPoppaOrg)
        var orgExists = UserService.isUserPartOfOrgByGithubId(bigPoppaUser, orgGithubId)
        expect(orgExists).to.be.true()
        done()
      })
    })
  })

  describe('isUserPartOfOrg', function () {
    var orgId = 232323
    var user = {}
    var userGithubId = '1111'
    keypather.set(user, 'accounts.github.id', userGithubId)
    var bigPoppaUser
    var bigPoppaOrg = {
      id: orgId
    }
    describe('success', function () {
      beforeEach(function (done) {
        bigPoppaUser = {
          organizations: []
        }
        done()
      })

      it('should resolve when the user has no orgs', function (done) {
        var orgExists = UserService.isUserPartOfOrg(bigPoppaUser, orgId)
        expect(orgExists).to.be.false()
        done()
      })

      it('should resolve when the user has the org', function (done) {
        bigPoppaUser.organizations.push(bigPoppaOrg)
        var orgExists = UserService.isUserPartOfOrg(bigPoppaUser, orgId)
        expect(orgExists).to.be.true()
        done()
      })
    })
  })

  describe('validateSessionUserPartOfOrg', function () {
    var orgId = 232323
    var user = {}
    var userGithubId = '1111'
    keypather.set(user, 'accounts.github.id', userGithubId)
    var bigPoppaUser
    var bigPoppaOrg = {
      id: orgId
    }
    beforeEach(function (done) {
      sinon.stub(UserService, 'getUser').resolves(bigPoppaUser)
      done()
    })

    afterEach(function (done) {
      UserService.getUser.restore()
      done()
    })

    describe('success', function () {
      beforeEach(function (done) {
        bigPoppaUser = {
          organizations: []
        }
        done()
      })

      it('should throw a UserNotFoundError when the user doesnt have the org', function (done) {
        UserService.validateSessionUserPartOfOrg(user, orgId)
          .catch(errors.UserNotAllowedError, function (err) {
            expect(err).to.exist()
            done()
          })
      })

      it('should resolve when the user has the org', function (done) {
        bigPoppaUser.organizations.push(bigPoppaOrg)
        UserService.getUser.resolves(bigPoppaUser)
        UserService.validateSessionUserPartOfOrg(user, orgId)
          .then(function (user) {
            expect(user).to.exist()
            done()
          })
      })
    })
  })

  describe('getUsersOrganizationsWithGithubModel', function () {
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
        UserService.getUsersOrganizationsWithGithubModel(user)
          .then(function (orgs) {
            expect(orgs).to.be.have.length(0)
            sinon.assert.calledOnce(UserService.getUser)
          })
          .asCallback(done)
      })

      it('should resolve when the user has the org', function (done) {
        Github.prototype.getUserAuthorizedOrgsAsync.resolves([ githubOrg ])
        bigPoppaUser.organizations.push(bigPoppaOrg)
        UserService.getUsersOrganizationsWithGithubModel(user)
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
        UserService.getUsersOrganizationsWithGithubModel(user)
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
        UserService.getUsersOrganizationsWithGithubModel(user)
          .asCallback(function (err) {
            expect(err).to.equal(error)
            done()
          })
      })
    })
  })

  describe('getCompleteUserById', function () {
    var findByIdStub
    var getByGithubIdStub
    var user
    const githubId = 1981198
    const userId = 546
    var bigPoppaUser
    beforeEach(function (done) {
      user = {
        accounts: {
          github: {
            id: githubId
          }
        },
        set: sinon.stub()
      }
      bigPoppaUser = {}
      findByIdStub = sinon.stub(User, 'findByIdAsync').resolves(user)
      getByGithubIdStub = sinon.stub(UserService, 'getByGithubId').resolves(bigPoppaUser)
      done()
    })
    afterEach(function (done) {
      findByIdStub.restore()
      getByGithubIdStub.restore()
      done()
    })

    it('should find the user by their id', function (done) {
      UserService.getCompleteUserById(userId)
      .then(function (res) {
        sinon.assert.calledOnce(findByIdStub)
        sinon.assert.calledWithExactly(findByIdStub, userId)
      })
      .asCallback(done)
    })

    it('should fetch the big poppa user', function (done) {
      UserService.getCompleteUserById(userId)
      .then(function (res) {
        sinon.assert.calledOnce(getByGithubIdStub)
        sinon.assert.calledWithExactly(getByGithubIdStub, githubId)
      })
      .asCallback(done)
    })

    it('should set the big poppa user', function (done) {
      UserService.getCompleteUserById(userId)
      .then(function (res) {
        sinon.assert.calledOnce(user.set)
        sinon.assert.calledWithExactly(user.set, 'bigPoppaUser', bigPoppaUser)
      })
      .asCallback(done)
    })

    it('should return the user', function (done) {
      UserService.getCompleteUserById(userId)
      .then(function (res) {
        expect(res).to.equal(user)
      })
      .asCallback(done)
    })

    it('should throw an error if it cant find the BP user', function (done) {
      getByGithubIdStub.rejects(new Error(''))

      UserService.getCompleteUserById(userId)
      .asCallback(function (err, res) {
        expect(err).to.exist()
        expect(err).to.equal(err)
        sinon.assert.notCalled(user.set)
        done()
      })
    })

    it('should throw an error if no user is found', function (done) {
      findByIdStub.resolves(null)

      UserService.getCompleteUserById(userId)
      .asCallback(function (err, res) {
        expect(err).to.be.an.instanceof(errors.UserNotFoundError)
        expect(err.message).to.match(/user.*not.*found/i)
        done()
      })
    })
  })

  describe('getCompleteUserByGithubId', function () {
    var findByGithubIdStub
    var getByGithubIdStub
    var user
    const githubId = 1981198
    var bigPoppaUser
    beforeEach(function (done) {
      user = {
        accounts: {
          github: {
            id: githubId
          }
        },
        set: sinon.stub()
      }
      bigPoppaUser = {}
      findByGithubIdStub = sinon.stub(User, 'findByGithubIdAsync').resolves(user)
      getByGithubIdStub = sinon.stub(UserService, 'getByGithubId').resolves(bigPoppaUser)
      done()
    })
    afterEach(function (done) {
      findByGithubIdStub.restore()
      getByGithubIdStub.restore()
      done()
    })

    it('should find the user by their id', function (done) {
      UserService.getCompleteUserByGithubId(githubId)
      .then(function (res) {
        sinon.assert.calledOnce(findByGithubIdStub)
        sinon.assert.calledWithExactly(findByGithubIdStub, githubId)
      })
      .asCallback(done)
    })

    it('should fetch the big poppa user', function (done) {
      UserService.getCompleteUserByGithubId(githubId)
      .then(function (res) {
        sinon.assert.calledOnce(getByGithubIdStub)
        sinon.assert.calledWithExactly(getByGithubIdStub, githubId)
      })
      .asCallback(done)
    })

    it('should set the big poppa user', function (done) {
      UserService.getCompleteUserByGithubId(githubId)
      .then(function (res) {
        sinon.assert.calledOnce(user.set)
        sinon.assert.calledWithExactly(user.set, 'bigPoppaUser', bigPoppaUser)
      })
      .asCallback(done)
    })

    it('should return the user', function (done) {
      UserService.getCompleteUserByGithubId(githubId)
      .then(function (res) {
        expect(res).to.equal(user)
      })
      .asCallback(done)
    })

    it('should not matter if the big poppa user is not found', function (done) {
      getByGithubIdStub.rejects(new Error(''))

      UserService.getCompleteUserByGithubId(githubId)
      .then(function (res) {
        expect(res).to.equal(user)
        sinon.assert.notCalled(user.set)
      })
      .asCallback(done)
    })

    it('should throw an error if no user is found', function (done) {
      findByGithubIdStub.resolves(null)

      UserService.getCompleteUserByGithubId(githubId)
      .asCallback(function (err, res) {
        expect(err).to.be.an.instanceof(errors.UserNotFoundError)
        expect(err.message).to.match(/user.*not.*found/i)
        done()
      })
    })
  })
})
