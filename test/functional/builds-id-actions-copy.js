'use strict'

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
var ObjectId = require('mongoose').Types.ObjectId

var api = require('./fixtures/api-control')
var multi = require('./fixtures/multi-factory')
var expects = require('./fixtures/expects')
var equals = require('101/equals')
var clone = require('101/clone')
var not = require('101/not')
var exists = require('101/exists')
var createCount = require('callback-count')
var mockGetUserById = require('./fixtures/mocks/github/getByUserId')

var ContextVersion = require('models/mongo/context-version')

describe('Build Copy - /builds/:id/actions/copy', function () {
  var ctx = {}
  beforeEach(
    mockGetUserById.stubBefore(function () {
      return [{
        id: 1,
        username: 'Runnable'
      }, {
        id: 2,
        username: 'otherOrg'
      }]
    })
  )
  afterEach(mockGetUserById.stubAfter)
  beforeEach(function (done) {
    multi.createContextVersion(function (err, contextVersion, context, build, user) {
      ctx.contextVersion = contextVersion
      ctx.context = context
      ctx.user = user
      ctx.build = build
      done(err)
    })
  })

  before(api.start.bind(ctx))
  after(api.stop.bind(ctx))
  afterEach(require('./fixtures/clean-mongo').removeEverything)
  afterEach(require('./fixtures/clean-ctx')(ctx))
  afterEach(require('./fixtures/clean-nock'))

  describe('POST', function () {
    describe('shallow copy', function () {
      describe('as owner', function () {
        it('should create a copy of the build', function (done) {
          var expectedNewBuild = clone(ctx.build.json())
          expectedNewBuild.contextVersions = [ctx.contextVersion.id()]
          expectedNewBuild.contexts = [ctx.context.id()]
          expectedNewBuild._id = not(equals(ctx.build.attrs._id))
          expectedNewBuild.id = not(equals(ctx.build.attrs.id))
          expectedNewBuild.created = not(equals(ctx.build.json().created))
          ctx.build.copy(expects.success(201, expectedNewBuild, done))
        })
      })
      describe('as moderator', function () {
        beforeEach(function (done) {
          ctx.moderator = multi.createModerator(done)
        })
        it('should create a copy of the build', function (done) {
          var expectedNewBuild = clone(ctx.build.json())
          expectedNewBuild.contextVersions = [ctx.contextVersion.id()]
          expectedNewBuild.contexts = [ctx.context.id()]
          expectedNewBuild._id = not(equals(ctx.build.json()._id))
          expectedNewBuild.id = not(equals(ctx.build.json().id))
          expectedNewBuild.created = not(equals(ctx.build.json().created))
          expectedNewBuild.createdBy = { github: ctx.moderator.json().accounts.github.id }
          expectedNewBuild.owner = { github: ctx.user.json().accounts.github.id }
          ctx.moderator.newBuild(ctx.build.id()).copy(expects.success(201, expectedNewBuild, done))
        })
      })
    })
    describe('deep copy', function () {
      describe('as owner', function () {
        describe('with userContainerMemoryInBytes set on the context version', function () {
          beforeEach(function (done) {
            ContextVersion.findById(new ObjectId(ctx.contextVersion.id()), function (err, cv) {
              if (err) { return done(err) }
              cv.userContainerMemoryInBytes = 1337
              cv.save(done)
            })
          })
          it('should create a copy of the context version maintaining the memory', function (done) {
            var expectedNewBuild = clone(ctx.build.json())
            expectedNewBuild.contextVersions = function (contextVersions) {
              expect(contextVersions.length).to.equal(1)
              expect(contextVersions[0]).to.not.equal(ctx.contextVersion.id())
              return true
            }
            expectedNewBuild.contexts = [ctx.context.id()]
            expectedNewBuild._id = not(equals(ctx.build.attrs._id))
            expectedNewBuild.id = not(equals(ctx.build.attrs.id))
            expectedNewBuild.created = not(equals(ctx.build.attrs.created))
            expectedNewBuild.started = not(exists)
            expectedNewBuild.completed = not(exists)
            expectedNewBuild.duration = not(exists)
            ctx.buildCopy = ctx.build
              .deepCopy(expects.success(201, expectedNewBuild, function (err) {
                if (err) { return done(err) }
                ContextVersion.findById(new ObjectId(ctx.buildCopy.attrs.contextVersions[0]), function (err, cv) {
                  expect(cv.userContainerMemoryInBytes).to.equal(1337)
                  expectUnbuiltVersions(ctx, done)(err)
                })
              }))
          })
        })
        it('should create a copy of the build', function (done) {
          var expectedNewBuild = clone(ctx.build.json())
          expectedNewBuild.contextVersions = function (contextVersions) {
            expect(contextVersions.length).to.equal(1)
            expect(contextVersions[0]).to.not.equal(ctx.contextVersion.id())
            return true
          }
          expectedNewBuild.contexts = [ctx.context.id()]
          expectedNewBuild._id = not(equals(ctx.build.attrs._id))
          expectedNewBuild.id = not(equals(ctx.build.attrs.id))
          expectedNewBuild.created = not(equals(ctx.build.attrs.created))
          expectedNewBuild.started = not(exists)
          expectedNewBuild.completed = not(exists)
          expectedNewBuild.duration = not(exists)
          ctx.buildCopy = ctx.build
            .deepCopy(expects.success(201, expectedNewBuild, expectUnbuiltVersions(ctx, done)))
        })
      })
      describe('as moderator', function () {
        beforeEach(function (done) {
          ctx.moderator = multi.createModerator(done)
        })
        it('should create a copy of the build', function (done) {
          var expectedNewBuild = clone(ctx.build.json())
          expectedNewBuild.contextVersions = function (contextVersions) {
            expect(contextVersions.length).to.equal(1)
            expect(contextVersions[0]).to.not.equal(ctx.contextVersion.id())
            return true
          }
          expectedNewBuild.contexts = [ctx.context.id()]
          expectedNewBuild._id = not(equals(ctx.build.attrs._id))
          expectedNewBuild.id = not(equals(ctx.build.attrs.id))
          expectedNewBuild.created = not(equals(ctx.build.attrs.created))
          expectedNewBuild.started = not(exists)
          expectedNewBuild.completed = not(exists)
          expectedNewBuild.duration = not(exists)
          expectedNewBuild.createdBy = { github: ctx.moderator.json().accounts.github.id }
          expectedNewBuild.owner = { github: ctx.user.json().accounts.github.id }
          ctx.buildCopy = ctx.moderator.newBuild(ctx.build.id())
            .deepCopy(expects.success(201, expectedNewBuild, expectUnbuiltVersions(ctx, done)))
        })
      })
    })
  })
})

function expectUnbuiltVersions (ctx, done) {
  return function (err) {
    var build = ctx.buildCopy
    if (err) { return done(err) }
    var count = createCount(build.attrs.contextVersions.length, done)
    build.attrs.contextVersions.forEach(function (versionId) {
      var expected = {
        'build.started': not(exists),
        'build.completed': not(exists)
      }
      ctx.context.fetchVersion(versionId,
        expects.success(200, expected, count.next))
    })
  }
}
