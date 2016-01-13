'use strict'

require('loadenv')()

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect

var api = require('../fixtures/api-control')
var dock = require('../fixtures/dock')
var multi = require('../fixtures/multi-factory')
var primus = require('../fixtures/primus')

describe('201 POST /contexts/:id/versions/:id/actions/copy', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  before(dock.start.bind(ctx))
  before(require('../fixtures/mocks/api-client').setup)
  beforeEach(primus.connect)

  afterEach(primus.disconnect)
  afterEach(require('../fixtures/clean-mongo').removeEverything)
  afterEach(require('../fixtures/clean-ctx')(ctx))
  afterEach(require('../fixtures/clean-nock'))
  after(dock.stop.bind(ctx))
  after(api.stop.bind(ctx))
  after(require('../fixtures/mocks/api-client').clean)

  describe('copying a hellorunnable cv', function () {
    beforeEach(function (done) {
      multi.createBuild(process.env.HELLO_RUNNABLE_GITHUB_ID, function (err, build, context, user, other) {
        if (err) { return done(err) }
        ctx.contextVersion = other[0]
        ctx.context = context
        done()
      })
    })
    beforeEach(function (done) {
      multi.createUser(function (err, user) {
        ctx.user = user
        done(err)
      })
    })

    it('should create a copy of the hellorunnable context version', function (done) {
      var newCv = ctx.user
        .newContext(ctx.context.id())
        .newVersion(ctx.contextVersion.id())
        .deepCopy(function (err) {
          if (err) { return done(err) }
          expect(newCv).to.exist()
          // when we expect something to be equal to the user that copied it, it shouldn't equal hellorunnable
          expect(ctx.user.attrs.accounts.github.id).to.not.equal(process.env.HELLO_RUNNABLE_GITHUB_ID)
          // the new cv's id should not equal the previous one
          expect(newCv.attrs._id).to.not.equal(ctx.contextVersion.attrs._id)
          // cv's context should be a new context
          expect(newCv.attrs.context).to.not.equal(ctx.contextVersion.attrs.context)
          // cv's owner should not equal the previous owner
          expect(newCv.attrs.owner.github).to.not.equal(ctx.contextVersion.attrs.owner.github)
          // cv's owner should be the user that copied it
          expect(newCv.attrs.owner.github).to.equal(ctx.user.attrs.accounts.github.id)
          // cv's createdBy should also be the user the copied it
          expect(newCv.attrs.createdBy.github).to.equal(ctx.user.attrs.accounts.github.id)
          // cv should have a new infracode version
          expect(newCv.attrs.infraCodeVersion).to.not.equal(ctx.contextVersion.attrs.infraCodeVersion)
          ctx.user
            .newContext(newCv.attrs.context)
            .newVersion(newCv.attrs._id)
            .fetch(function (err, cvData) {
              if (err) { return done(err) }
              expect(cvData.owner.github).to.equal(ctx.user.attrs.accounts.github.id)
              done()
            })
        })
    })

    describe('in an org', function () {
      it('should create a copy of the HR CV', function (done) {
        var body = { owner: { github: 444 } }
        require('../fixtures/mocks/github/user-orgs')(ctx.user, 444, 'Runnable1')
        var newCv = ctx.user
          .newContext(ctx.context.id())
          .newVersion(ctx.contextVersion.id())
          .deepCopy(body, function (err) {
            if (err) { return done(err) }
            expect(newCv).to.exist()
            // when we expect something to be equal to the user that copied it, it shouldn't equal hellorunnable
            expect(ctx.user.attrs.accounts.github.id).to.not.equal(process.env.HELLO_RUNNABLE_GITHUB_ID)
            // the new cv's id should not equal the previous one
            expect(newCv.attrs._id).to.not.equal(ctx.contextVersion.attrs._id)
            // cv's context should be a new context
            expect(newCv.attrs.context).to.not.equal(ctx.contextVersion.attrs.context)
            // cv's owner should not equal the previous owner
            expect(newCv.attrs.owner.github).to.not.equal(ctx.contextVersion.attrs.owner.github)
            // cv's owner should be the org that overrode it
            expect(newCv.attrs.owner.github).to.equal(body.owner.github)
            // cv's createdBy should be the user the copied it
            expect(newCv.attrs.createdBy.github).to.equal(ctx.user.attrs.accounts.github.id)
            // cv should have a new infracode version
            expect(newCv.attrs.infraCodeVersion).to.not.equal(ctx.contextVersion.attrs.infraCodeVersion)
            var context = ctx.user.newContext(newCv.attrs.context)
            context.fetch(function (err, contextData) {
              if (err) { return done(err) }
              // the context should be owned by the overridden user
              expect(contextData.owner.github).to.equal(body.owner.github)
              context.newVersion(newCv.attrs._id).fetch(function (err, cvData) {
                if (err) { return done(err) }
                expect(cvData.owner.github).to.equal(body.owner.github)
                done()
              })
            })
          })
      })
    })
  })

  describe("copying one's own cv", function () {
    beforeEach(function (done) {
      multi.createBuild(function (err, build, context, user, other) {
        ctx.contextVersion = other[0]
        ctx.context = context
        ctx.user = user
        done(err)
      })
    })

    it('should create a copy of the context version', function (done) {
      var newCv = ctx.user
        .newContext(ctx.context.id())
        .newVersion(ctx.contextVersion.id())
        .deepCopy(function (err) {
          if (err) { return done(err) }
          expect(newCv).to.exist()
          // the new cv's id should not equal the previous one
          expect(newCv.attrs._id).to.not.equal(ctx.contextVersion.attrs._id)
          // cv's context should be a the same context
          expect(newCv.attrs.context).to.equal(ctx.contextVersion.attrs.context)
          // cv's owner should be the same as the previous one
          expect(newCv.attrs.owner.github).to.equal(ctx.contextVersion.attrs.owner.github)
          // cv's createdBy should be the user the copied it
          expect(newCv.attrs.createdBy.github).to.equal(ctx.user.attrs.accounts.github.id)
          // cv should have a new infracode version
          expect(newCv.attrs.infraCodeVersion).to.not.equal(ctx.contextVersion.attrs.infraCodeVersion)
          done()
        })
    })
  })
})
