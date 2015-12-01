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
var nock = require('nock')
var sinon = require('sinon')
var SendGrid = require('models/apis/sendgrid')

var api = require('./fixtures/api-control')
var ctx = {
  githubUserId: 1,
  orgGithubId: 999
}
var createInvitation = function (done) {
  var opts = {
    organization: {
      github: ctx.orgGithubId
    },
    recipient: {
      email: ctx.user.attrs.email,
      github: ctx.githubUserId
    }
  }
  ctx.user.createTeammateInvitation(opts, done)
}

describe('TeammateInvitation', function () {
  before(api.start.bind(ctx))
  beforeEach(function (done) {
    ctx.name = randStr(5)
    ctx.j = request.jar()
    require('./fixtures/multi-factory').createUser({
      requestDefaults: { jar: ctx.j }
    }, function (err, user) {
      if (err) {
        done(err)
      }
      ctx.user = user
      githubUserOrgsMock(ctx.user, ctx.orgGithubId, 'super-org')
      done()
    })
    sinon.stub(SendGrid.prototype, 'inviteAdmin').yieldsAsync()
    sinon.stub(SendGrid.prototype, 'inviteUser').yieldsAsync()
  })
  afterEach(function (done) {
    nock.cleanAll()
    SendGrid.prototype.inviteAdmin.restore()
    SendGrid.prototype.inviteUser.restore()
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
          github: 777
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
          github: ctx.orgGithubId
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
        expect(inviteUserArgs[0], 'recipient').deep.to.equal(opts.recipient)
        expect(inviteUserArgs[1]._id.toString(), 'sessionUser').to.equal(ctx.user.id())
        expect(inviteUserArgs[2], 'organizationId').to.equal(ctx.orgGithubId)
        expect(inviteUserArgs[3], 'cb').to.be.a.function()
        expect(res).to.be.an.object()
        expect(res.recipient).to.be.an.object()
        expect(res.organization).to.be.an.object()
        expect(res.recipient.github).to.equal(ctx.githubUserId)
        expect(res.recipient.email).to.equal(ctx.user.attrs.email)
        expect(res.organization.github).to.equal(ctx.orgGithubId)
        expect(res.owner).to.be.an.object()
        expect(res.owner.github).to.be.a.number()
        expect(res.owner.github).to.equal(ctx.user.attrs.accounts.github.id)
        done()
      })
    })
    it('should create a new invitation, and send an admin email', function (done) {
      var opts = {
        organization: {
          github: ctx.orgGithubId
        },
        recipient: {
          email: ctx.user.attrs.email,
          github: ctx.githubUserId
        },
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
        expect(inviteAdminArgs[0], 'recipient').to.deep.equal(opts.recipient)
        expect(inviteAdminArgs[1]._id.toString(), 'sessionUser').to.equal(ctx.user.id())
        expect(inviteAdminArgs[2], 'organizationId').to.equal(ctx.orgGithubId)
        expect(inviteAdminArgs[3], 'cb').to.be.a.function()
        expect(res).to.be.an.object()
        expect(res.recipient).to.be.an.object()
        expect(res.organization).to.be.an.object()
        expect(res.recipient.github).to.equal(ctx.githubUserId)
        expect(res.recipient.email).to.equal(ctx.user.attrs.email)
        expect(res.organization.github).to.equal(ctx.orgGithubId)
        expect(res.owner).to.be.an.object()
        expect(res.owner.github).to.be.a.number()
        expect(res.owner.github).to.equal(ctx.user.attrs.accounts.github.id)
        done()
      })
    })
  })

  describe('GET /teammate-invitation/', function () {
    it('should deny a user querying an org it doesnt belong to', function (done) {
      ctx.user.fetchTeammateInvitations({ orgGithubId: 2 }, function (err, res, statusCode) {
        if (err) {
          expect(err).to.be.an.object()
          expect(err.message).to.match(/access denied/ig)
          return done()
        }
      })
    })

    it('should return an empty array if there are no invitations', function (done) {
      ctx.user.fetchTeammateInvitations({ orgGithubId: ctx.orgGithubId }, function (err, res, statusCode) {
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
        ctx.user.fetchTeammateInvitations({ orgGithubId: ctx.orgGithubId }, function (err, res, statusCode) {
          if (err) {
            return done(err)
          }
          expect(statusCode).to.equal(200)
          expect(res).to.be.an.array()
          expect(res.length).to.equal(1)
          expect(res[0]).to.be.an.object()
          expect(res[0].recipient.github).to.equal(ctx.githubUserId)
          expect(res[0].recipient.email).to.equal(ctx.user.attrs.email)
          expect(res[0].organization.github).to.equal(ctx.orgGithubId)
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
        ctx.user.fetchTeammateInvitations({ orgGithubId: ctx.orgGithubId }, cb)
      }, function (collection, statusCode, res, cb) {
        expect(collection).to.be.an.array()
        expect(collection.length).to.equal(1) // Invitation created by POST
        expect(collection[0]._id).to.be.a.string()
        ctx.user.destroyTeammateInvitation(collection[0]._id, {}, cb)
      }, function (collection, statusCode, res, cb) {
        expect(statusCode).to.equal(204)
        ctx.user.fetchTeammateInvitations({ orgGithubId: ctx.orgGithubId }, cb)
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
          done()
        })
      })

      it('should delete invitations from the database', function (done) {
        ctx.user.fetchTeammateInvitations({ orgGithubId: ctx.orgGithubId }, function (err, collection) {
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
