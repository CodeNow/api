'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach

var async = require('async')
var Code = require('code')
var expect = Code.expect
var request = require('request')
var randStr = require('randomstring').generate
var githubUserOrgsMock = require('./fixtures/mocks/github/user-orgs.js')
var mockGetUserById = require('./fixtures/mocks/github/getByUserId')
var nock = require('nock')
var sinon = require('sinon')
const whitelistOrgs = require('./fixtures/mocks/big-poppa').whitelistOrgs
const whitelistUserOrgs = require('./fixtures/mocks/big-poppa').whitelistUserOrgs

var Boom = require('dat-middleware').Boom
var Promise = require('bluebird')
var SendGrid = require('models/apis/sendgrid')

var api = require('./fixtures/api-control')
var ctx = {
  githubUserId: 1
}

var thatOtherOrg = {
  name: 'hello',
  githubId: 777,
  allowed: true
}
var superOrg = {
  name: 'super-org',
  githubId: 123123,
  allowed: true
}

var createInvitation = function (done) {
  var opts = {
    organization: {
      github: superOrg.githubId
    },
    recipient: {
      email: ctx.user.attrs.email,
      github: ctx.githubUserId
    }
  }
  ctx.user.createTeammateInvitation(opts, done)
}
beforeEach(
  mockGetUserById.stubBefore(function () {
    return [{
      id: superOrg.githubId,
      username: superOrg.name
    }, {
      id: thatOtherOrg.githubId,
      username: thatOtherOrg.name
    }]
  })
)
afterEach(mockGetUserById.stubAfter)

describe('TeammateInvitation', function () {
  before(api.start.bind(ctx))

  beforeEach(function (done) {
    whitelistOrgs([thatOtherOrg, superOrg])
    done()
  })

  beforeEach(function (done) {
    ctx.name = randStr(5)
    ctx.j = request.jar()
    sinon.stub(SendGrid.prototype, 'inviteAdmin').returns(Promise.resolve(true))
    sinon.stub(SendGrid.prototype, 'inviteUser').returns(Promise.resolve(true))
    require('./fixtures/multi-factory').createUser({
      requestDefaults: { jar: ctx.j }
    }, function (err, user) {
      if (err) {
        return done(err)
      }
      ctx.user = user
      whitelistUserOrgs(user, [superOrg])
      githubUserOrgsMock(ctx.user, superOrg.githubId, superOrg.name)
      return done()
    })
  })
  afterEach(function (done) {
    SendGrid.prototype.inviteAdmin.restore()
    SendGrid.prototype.inviteUser.restore()
    nock.cleanAll()
    done()
  })
  after(api.stop.bind(ctx))
  afterEach(function (done) {
    require('./fixtures/clean-mongo').removeEverything()
    done()
  })

  describe('POST /teammate-invitation', function () {
    it('should not create a new invitation if the user is not part of the original org', function (done) {
      var opts = {
        organization: {
          github: thatOtherOrg.githubId
        },
        recipient: {
          email: ctx.user.attrs.email,
          github: ctx.githubUserId
        }
      }
      ctx.user.createTeammateInvitation(opts, function (err, res, statusCode) {
        if (err) {
          expect(err).to.be.an.object()
          expect(err.message).to.match(/access denied/ig)
          sinon.assert.notCalled(SendGrid.prototype.inviteUser)
          sinon.assert.notCalled(SendGrid.prototype.inviteAdmin)
          return done()
        }
      })
    })

    it('should create a new invitation', function (done) {
      var opts = {
        organization: {
          github: superOrg.githubId
        },
        recipient: {
          email: ctx.user.attrs.email,
          github: ctx.githubUserId
        }
      }
      ctx.user.createTeammateInvitation(opts, function (err, res, statusCode) {
        if (err) {
          return done(err)
        }
        expect(statusCode).to.equal(201)
        sinon.assert.calledOnce(SendGrid.prototype.inviteUser)
        sinon.assert.notCalled(SendGrid.prototype.inviteAdmin)
        var inviteUserArgs = SendGrid.prototype.inviteUser.args[0]
        expect(inviteUserArgs[0], 'recipient').to.equal(opts.recipient)
        expect(inviteUserArgs[1]._id.toString(), 'sessionUser').to.equal(ctx.user.id())
        expect(inviteUserArgs[2], 'organizationId').to.equal(superOrg.githubId)
        expect(res).to.be.an.object()
        expect(res.recipient).to.be.an.object()
        expect(res.organization).to.be.an.object()
        expect(res.recipient.github).to.equal(ctx.githubUserId)
        expect(res.recipient.email).to.equal(ctx.user.attrs.email)
        expect(res.organization.github).to.equal(superOrg.githubId)
        expect(res.owner).to.be.an.object()
        expect(res.owner.github).to.be.a.number()
        expect(res.owner.github).to.equal(ctx.user.attrs.accounts.github.id)
        done()
      })
    })
    it('should create a new invitation, and send an admin email', function (done) {
      var opts = {
        organization: {
          github: superOrg.githubId
        },
        recipient: {
          email: ctx.user.attrs.email,
          github: ctx.githubUserId
        },
        emailMessage: 'asdasdasd',
        admin: true
      }
      ctx.user.createTeammateInvitation(opts, function (err, res, statusCode) {
        if (err) {
          return done(err)
        }
        expect(statusCode).to.equal(201)
        sinon.assert.calledOnce(SendGrid.prototype.inviteAdmin)
        sinon.assert.notCalled(SendGrid.prototype.inviteUser)
        var inviteAdminArgs = SendGrid.prototype.inviteAdmin.args[0]
        expect(inviteAdminArgs[0], 'recipient').to.equal(opts.recipient)
        expect(inviteAdminArgs[1]._id.toString(), 'sessionUser').to.equal(ctx.user.id())
        expect(inviteAdminArgs[2], 'emailMessage').to.equal('asdasdasd')
        expect(res).to.be.an.object()
        expect(res.recipient).to.be.an.object()
        expect(res.organization).to.be.an.object()
        expect(res.recipient.github).to.equal(ctx.githubUserId)
        expect(res.recipient.email).to.equal(ctx.user.attrs.email)
        expect(res.organization.github).to.equal(superOrg.githubId)
        expect(res.owner).to.be.an.object()
        expect(res.owner.github).to.be.a.number()
        expect(res.owner.github).to.equal(ctx.user.attrs.accounts.github.id)
        done()
      })
    })
    it('should attempt to create an admin email, but get an error', function (done) {
      var opts = {
        organization: {
          github: superOrg.githubId
        },
        recipient: {
          email: ctx.user.attrs.email,
          github: ctx.githubUserId
        },
        emailMessage: 'asdasdasd',
        admin: true
      }
      var error = Boom.badGateway('this is an error')
      SendGrid.prototype.inviteAdmin.restore()

      var rejectionPromise = Promise.reject(error)
      rejectionPromise.suppressUnhandledRejections()
      sinon.stub(SendGrid.prototype, 'inviteAdmin').returns(rejectionPromise)

      ctx.user.createTeammateInvitation(opts, function (err) {
        expect(err, 'err').to.be.an.object()
        expect(err.output.statusCode, 'statusCode').to.equal(502)
        expect(err.message, 'err message').to.equal('this is an error')
        done()
      })
    })
  })

  describe('GET /teammate-invitation/', function () {
    it('should deny a user querying an org it doesnt belong to', function (done) {
      ctx.user.fetchTeammateInvitations({ orgGithubId: thatOtherOrg.githubId }, function (err, res, statusCode) {
        if (err) {
          expect(err).to.be.an.object()
          expect(err.message).to.match(/access denied/ig)
          return done()
        }
      })
    })

    it('should return an empty array if there are no invitations', function (done) {
      ctx.user.fetchTeammateInvitations({ orgGithubId: superOrg.githubId }, function (err, res, statusCode) {
        if (err) {
          return done(err)
        }
        expect(statusCode).to.equal(200)
        expect(res).to.be.an.array()
        expect(res.length).to.equal(0)
        done()
      })
    })

    describe('Getting Invitations', function () {
      beforeEach(createInvitation)

      it('should get the results for an org that has invitations', function (done) {
        ctx.user.fetchTeammateInvitations({ orgGithubId: superOrg.githubId }, function (err, res, statusCode) {
          if (err) {
            return done(err)
          }
          expect(statusCode).to.equal(200)
          expect(res).to.be.an.array()
          expect(res.length).to.equal(1)
          expect(res[0]).to.be.an.object()
          expect(res[0].recipient.github).to.equal(ctx.githubUserId)
          expect(res[0].recipient.email).to.equal(ctx.user.attrs.email)
          expect(res[0].organization.github).to.equal(superOrg.githubId)
          expect(res[0].owner).to.be.an.object()
          expect(res[0].owner.github).to.be.a.number()
          expect(res[0].owner.github).to.equal(ctx.user.attrs.accounts.github.id)
          done()
        })
      })
    })
  })

  describe('DELETE /teammate-invitation/:orgName', function () {
    beforeEach(createInvitation)

    it('should delete invitations from the database', function (done) {
      async.waterfall([ function (cb) {
        ctx.user.fetchTeammateInvitations({ orgGithubId: superOrg.githubId }, cb)
      }, function (collection, statusCode, res, cb) {
        expect(collection).to.be.an.array()
        expect(collection.length).to.equal(1) // Invitation created by POST
        expect(collection[0]._id).to.be.a.string()
        ctx.user.destroyTeammateInvitation(collection[0]._id, {}, cb)
      }, function (collection, statusCode, res, cb) {
        expect(statusCode).to.equal(204)
        ctx.user.fetchTeammateInvitations({ orgGithubId: superOrg.githubId }, cb)
      }, function (collection, statusCode, res, cb) {
        expect(collection).to.be.an.array()
        expect(collection.length).to.equal(0)
        cb()
      }], done)
    })

    describe('Unathorized Delete', function () {
      var unauthorizedUser
      before(function (done) {
        ctx.name = randStr(5)
        ctx.j = request.jar()
        require('./fixtures/multi-factory').createUser({
          requestDefaults: { jar: ctx.j }
        }, function (err, user) {
          if (err) {
            done(err)
          }
          unauthorizedUser = user
          whitelistUserOrgs(user, [])
          done()
        })
      })

      it('should delete invitations from the database', function (done) {
        ctx.user.fetchTeammateInvitations({ orgGithubId: superOrg.githubId }, function (err, collection) {
          if (err) {
            done(err)
          }
          githubUserOrgsMock(unauthorizedUser, 777, 'not-super-org')
          unauthorizedUser.destroyTeammateInvitation(collection[0]._id, {}, function (err, res) {
            if (err) {
              expect(err).to.be.an.object()
              expect(err.message).to.match(/access denied/ig)
              return done()
            }
          })
        })
      })
    })
  })
})
