'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach

var expects = require('./fixtures/expects')
var api = require('./fixtures/api-control')
var dock = require('./fixtures/dock')
var multi = require('./fixtures/multi-factory')
var primus = require('./fixtures/primus')

describe('Version - /contexts/:contextId/versions/:id', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  before(dock.start.bind(ctx))
  beforeEach(primus.connect)
  afterEach(primus.disconnect)
  after(api.stop.bind(ctx))
  after(dock.stop.bind(ctx))
  afterEach(require('./fixtures/clean-mongo').removeEverything)
  afterEach(require('./fixtures/clean-ctx')(ctx))
  afterEach(require('./fixtures/clean-nock'))

  /**
   * Helper BeforeEach function to create a moderator user.
   * @param done done function pointer
   */
  function createModUser (done) {
    ctx.moderator = multi.createModerator(done)
  }
  /**
   * Helper BeforeEach function to create another user, to use as someone who doesn't own the
   * 'owners' context.
   * @param done done function pointer
   */
  function createNonOwner (done) {
    ctx.nonOwner = multi.createUser(done)
  }

  function createNonOwnerContext (done) {
    ctx.nonOwnerContext = multi.createContextPath(ctx.nonOwner, ctx.context.id())
    done()
  }
  function createModContextVersion (done) {
    ctx.modContext = multi.createContextPath(ctx.moderator, ctx.context.id())
    done()
  }

  beforeEach(function (done) {
    multi.createBuiltBuild(function (err, build, user, modelArr) {
      if (err) { return done(err) }
      ctx.build = build
      ctx.user = user
      ctx.contextVersion = modelArr[0]
      ctx.context = modelArr[1]
      done()
    })
  })

  describe('GET', function () {
    describe('permissions', function () {
      describe('owner', function () {
        it('should get the version', function (done) {
          var expected = ctx.contextVersion.json()
          require('./fixtures/mocks/github/user')(ctx.user)
          ctx.contextVersion.fetch(ctx.contextVersion.id(), expects.success(200, expected, done))
        })
      })
      describe('non-owner', function () {
        beforeEach(createNonOwner)
        beforeEach(createNonOwnerContext)
        it('should not get the version (403 forbidden)', function (done) {
          require('./fixtures/mocks/github/user-orgs')(ctx.nonOwner) // non owner org
          ctx.nonOwnerContext.fetchVersion(ctx.contextVersion.id(), expects.errorStatus(403, done))
        })
      })
      describe('moderator', function () {
        beforeEach(createModUser)
        beforeEach(createModContextVersion)
        it('should get the version', function (done) {
          require('./fixtures/mocks/github/user')(ctx.moderator)
          var expected = ctx.contextVersion.json()
          // Calling the nock for the original user since the fetch call has to look up the username
          // by id.
          require('./fixtures/mocks/github/user')(ctx.user)
          ctx.modContext.fetchVersion(ctx.contextVersion.id(), expects.success(200, expected, done))
        })
      })
    })
  })

  describe('DELETE', function () {
    describe('permissions', function () {
      describe('owner', function () {
        it('should 405 delete the context', function (done) {
          ctx.contextVersion.destroy(expects.errorStatus(405, done))
        })
      })
      describe('non-owner', function () {
        beforeEach(createNonOwner)
        beforeEach(createNonOwnerContext)
        it('should 405 not delete the context (403 forbidden)', function (done) {
          ctx.nonOwnerContext.destroyVersion(ctx.contextVersion.id(),
            expects.errorStatus(405, done))
        })
      })
      describe('moderator', function () {
        beforeEach(createModUser)
        beforeEach(createModContextVersion)
        it('should 405 delete the context', function (done) {
          ctx.modContext.destroyVersion(ctx.contextVersion.id(), expects.errorStatus(405, done))
        })
      })
    })
  })
})
