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
var rabbitMQ = require('models/rabbitmq')
require('sinon-as-promised')(require('bluebird'))

var OrganizationService = require('models/services/organization-service')
const PermissionService = require('models/services/permission-service')

var BigPoppaClient = require('@runnable/big-poppa-client')
var Github = require('models/apis/github')

describe('Organization Service', function () {
  var orgGithubId
  var orgGithubName
  var bigPoppaOrg
  var bigPoppaUser
  var user
  var userGithubId
  var githubOrg
  var sessionUser
  beforeEach(function (done) {
    orgGithubId = '232323'
    orgGithubName = 'Runnable'
    user = {}
    userGithubId = '1111'
    keypather.set(user, 'accounts.github.id', userGithubId)
    bigPoppaUser = {
      id: '0999909909',
      githubId: userGithubId,
      organizations: []
    }
    bigPoppaOrg = {
      id: '12123123123',
      githubId: orgGithubId
    }
    githubOrg = {
      id: orgGithubId,
      login: orgGithubName
    }
    sessionUser = {
      accounts: {
        github: {
          id: userGithubId,
          accessToken: 'asdasdasdas2e2e3q2eqd',
          username: 'user'
        }
      },
      email: 'asdassadasdasd',
      created: new Date()
    }
    done()
  })
  describe('create', function () {
    describe('fail', function () {
      beforeEach(function (done) {
        sinon.stub(OrganizationService, 'getByGithubUsername').resolves()
        sinon.stub(Github.prototype, 'getUserByUsernameAsync').resolves(githubOrg)
        sinon.stub(BigPoppaClient.prototype, 'getUsers').resolves(bigPoppaUser)
        sinon.stub(rabbitMQ, 'publishOrganizationAuthorized').resolves()
        done()
      })

      afterEach(function (done) {
        OrganizationService.getByGithubUsername.restore()
        BigPoppaClient.prototype.getUsers.restore()
        rabbitMQ.publishOrganizationAuthorized.restore()
        Github.prototype.getUserByUsernameAsync.restore()
        done()
      })
      it('should throw badRequest with no orgName', function (done) {
        OrganizationService.create()
          .asCallback(function (err) {
            expect(err.message).to.match(/orgGithubName is required/)
            done()
          })
      })
      it('should throw unauthorized with no orgName', function (done) {
        OrganizationService.create(orgGithubName)
          .asCallback(function (err) {
            expect(err.message).to.match(/create a whitelist/)
            done()
          })
      })
    })

    describe('success first user', function () {
      beforeEach(function (done) {
        sinon.stub(Github.prototype, 'getUserByUsernameAsync').resolves(githubOrg)
        sinon.stub(BigPoppaClient.prototype, 'getUsers').resolves(bigPoppaUser)
        sinon.stub(rabbitMQ, 'publishOrganizationAuthorized').resolves()
        done()
      })

      afterEach(function (done) {
        BigPoppaClient.prototype.getUsers.restore()
        rabbitMQ.publishOrganizationAuthorized.restore()
        Github.prototype.getUserByUsernameAsync.restore()
        done()
      })

      it('should resolve after creating a new organization.authorized job', function (done) {
        OrganizationService.create(orgGithubName, sessionUser)
          .tap(function () {
            sinon.assert.calledOnce(Github.prototype.getUserByUsernameAsync)
            sinon.assert.calledWith(Github.prototype.getUserByUsernameAsync, orgGithubName)
            sinon.assert.calledOnce(rabbitMQ.publishOrganizationAuthorized)
            sinon.assert.calledWith(rabbitMQ.publishOrganizationAuthorized, {
              githubId: orgGithubId,
              creator: {
                githubId: userGithubId,
                githubUsername: sessionUser.accounts.github.username,
                email: sessionUser.email,
                created: sinon.match.string
              }
            })
          })
          .asCallback(done)
      })
    })
    describe('success second user', function () {
      beforeEach(function (done) {
        sinon.stub(OrganizationService, 'getByGithubUsername').resolves(bigPoppaOrg)
        sinon.stub(PermissionService, 'isOwnerOf').resolves()
        sinon.stub(Github.prototype, 'getUserByUsernameAsync').resolves(githubOrg)
        done()
      })

      afterEach(function (done) {
        OrganizationService.getByGithubUsername.restore()
        PermissionService.isOwnerOf.restore()
        Github.prototype.getUserByUsernameAsync.restore()
        done()
      })

      it('should resolve after creating a new organization.authorized job', function (done) {
        OrganizationService.create(orgGithubName, sessionUser)
          .tap(function () {
            sinon.assert.notCalled(Github.prototype.getUserByUsernameAsync)
            sinon.assert.calledOnce(OrganizationService.getByGithubUsername)
            sinon.assert.calledWith(OrganizationService.getByGithubUsername, orgGithubName)
            sinon.assert.calledOnce(PermissionService.isOwnerOf)
            sinon.assert.calledWith(PermissionService.isOwnerOf,
              sessionUser, { owner: { github: orgGithubId } }
            )
          })
          .asCallback(done)
      })
    })
  })
  describe('getByGithubId', function () {
    beforeEach(function (done) {
      sinon.stub(BigPoppaClient.prototype, 'getOrganizations').resolves([bigPoppaOrg])
      done()
    })

    afterEach(function (done) {
      BigPoppaClient.prototype.getOrganizations.restore()
      done()
    })
    describe('fail', function () {
      it('should throw OrganizationNotFoundError when no org is returned', function (done) {
        BigPoppaClient.prototype.getOrganizations.resolves()
        OrganizationService.getByGithubId(orgGithubId)
          .asCallback(function (err) {
            expect(err.message).to.match(/Organization not found/)
            done()
          })
      })
    })

    describe('success', function () {
      it('should resolve after creating a new organization.authorized job', function (done) {
        OrganizationService.getByGithubId(orgGithubId)
          .tap(function (org) {
            sinon.assert.calledOnce(BigPoppaClient.prototype.getOrganizations)
            sinon.assert.calledWith(BigPoppaClient.prototype.getOrganizations, {
              githubId: orgGithubId
            })
            expect(org).to.equal(bigPoppaOrg)
          })
          .asCallback(done)
      })
    })
  })

  describe('getByGithubUsername', function () {
    beforeEach(function (done) {
      sinon.stub(BigPoppaClient.prototype, 'getOrganizations').resolves([bigPoppaOrg])
      done()
    })

    afterEach(function (done) {
      BigPoppaClient.prototype.getOrganizations.restore()
      done()
    })
    describe('fail', function () {
      it('should throw OrganizationNotFoundError when no org is returned', function (done) {
        BigPoppaClient.prototype.getOrganizations.resolves()
        OrganizationService.getByGithubUsername(orgGithubName)
          .asCallback(function (err) {
            expect(err.message).to.match(/Organization not found/)
            done()
          })
      })
    })

    describe('success', function () {
      it('should resolve after creating a new organization.authorized job', function (done) {
        OrganizationService.getByGithubUsername(orgGithubName)
          .tap(function (org) {
            sinon.assert.calledOnce(BigPoppaClient.prototype.getOrganizations)
            sinon.assert.calledWith(BigPoppaClient.prototype.getOrganizations, {
              name: orgGithubName
            })
            expect(org).to.equal(bigPoppaOrg)
          })
          .asCallback(done)
      })
    })
  })

  describe('updateById', function () {
    var update = {
      name: 'evenBetterName'
    }
    beforeEach(function (done) {
      sinon.stub(BigPoppaClient.prototype, 'updateOrganization').resolves(bigPoppaOrg)
      done()
    })

    afterEach(function (done) {
      BigPoppaClient.prototype.updateOrganization.restore()
      done()
    })

    describe('success', function () {
      it('should resolve after creating a new organization.authorized job', function (done) {
        OrganizationService.updateById(bigPoppaOrg.id, update)
          .tap(function (org) {
            sinon.assert.calledOnce(BigPoppaClient.prototype.updateOrganization)
            sinon.assert.calledWith(BigPoppaClient.prototype.updateOrganization, bigPoppaOrg.id, update)
            expect(org).to.equal(bigPoppaOrg)
          })
          .asCallback(done)
      })
    })
  })

  describe('updateByGithubId', function () {
    var update = {
      name: 'evenBetterName'
    }
    beforeEach(function (done) {
      sinon.stub(OrganizationService, 'getByGithubId').resolves(bigPoppaOrg)
      sinon.stub(OrganizationService, 'updateById').resolves(bigPoppaOrg)
      done()
    })

    afterEach(function (done) {
      OrganizationService.getByGithubId.restore()
      OrganizationService.updateById.restore()
      done()
    })

    describe('success', function () {
      it('should resolve after creating a new organization.authorized job', function (done) {
        OrganizationService.updateByGithubId(bigPoppaOrg.githubId, update)
          .tap(function (org) {
            sinon.assert.calledOnce(OrganizationService.getByGithubId)
            sinon.assert.calledWith(OrganizationService.getByGithubId, bigPoppaOrg.githubId)
            sinon.assert.calledOnce(OrganizationService.updateById)
            sinon.assert.calledWith(OrganizationService.updateById, bigPoppaOrg.id, update)
            expect(org).to.equal(bigPoppaOrg)
          })
          .asCallback(done)
      })
    })
  })

  describe('addUser', function () {
    beforeEach(function (done) {
      sinon.stub(BigPoppaClient.prototype, 'addUserToOrganization').resolves()
      done()
    })

    afterEach(function (done) {
      BigPoppaClient.prototype.addUserToOrganization.restore()
      done()
    })

    describe('success', function () {
      it('should resolve after creating a new organization.authorized job', function (done) {
        OrganizationService.addUser(bigPoppaOrg, bigPoppaUser)
          .tap(function () {
            sinon.assert.calledOnce(BigPoppaClient.prototype.addUserToOrganization)
            sinon.assert.calledWith(BigPoppaClient.prototype.addUserToOrganization, bigPoppaOrg.id, bigPoppaUser.id)
          })
          .asCallback(done)
      })
    })
  })
})
