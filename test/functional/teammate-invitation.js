'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var after = lab.after

var async = require('async')
var Code = require('code')
var expect = Code.expect
var request = require('request')
var randStr = require('randomstring').generate
var githubUserOrgsMock = require('./fixtures/mocks/github/user-orgs.js')

var api = require('./fixtures/api-control')
var ctx = {
  githubUserId: 1,
  orgGithubId: 999
}

describe('TeammateInvitation', function () {
  before(api.start.bind(ctx))
  before(function (done) {
    ctx.name = randStr(5)
    ctx.j = request.jar()
    require('./fixtures/multi-factory').createUser({
      requestDefaults: { jar: ctx.j }
    }, function (err, user) {
      if (err) {
        done(err)
      }
      ctx.user = user
      githubUserOrgsMock(ctx.user, ctx.orgGithubId, 'org-3')
      done()
    })
  })
  after(api.stop.bind(ctx))
  after(function (done) {
    require('./fixtures/clean-mongo').removeEverything()
    done()
  })

  describe('POST /teammate-invitation', function () {
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

  describe('DELETE /teammate-invitation/:orgName', function () {
    it('should delete invitations from the database', function (done) {
      async.waterfall([ function (cb) {
        ctx.user.fetchTeammateInvitations({ orgGithubId: ctx.orgGithubId }, cb)
      }, function (collection, statusCode, res, cb) {
        expect(collection).to.be.an.array()
        expect(collection.length).to.equal(1)
        expect(collection[0]._id).to.be.a.string()
        return ctx.user.destroyTeammateInvitation(collection[0]._id, {}, cb)
      }, function (collection, statusCode, res, cb) {
        expect(statusCode).to.equal(204)
        ctx.user.fetchTeammateInvitations({ orgGithubId: ctx.orgGithubId }, cb)
      }, function (collection, statusCode, res, cb) {
        expect(collection).to.be.an.array()
        expect(collection.length).to.equal(0)
        cb()
      }], done)
    })
  })
})
