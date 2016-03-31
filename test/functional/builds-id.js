'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach

var api = require('./fixtures/api-control')
var mockGetUserById = require('./fixtures/mocks/github/getByUserId')
var multi = require('./fixtures/multi-factory')
var expects = require('./fixtures/expects')

var ctx = {}

function createOtherUserBuild (build, done) {
  multi.createUser(function (err, user) {
    ctx.otherUser = user
    ctx.otherUserBuild = ctx.otherUser.newBuild(build.id())
    done(err)
  })
}
function createModeratorBuild (build, done) {
  multi.createModerator(function (err, user) {
    ctx.moderator = user
    ctx.moderatorBuild = ctx.moderator.newBuild(build.id())
    done(err)
  })
}
beforeEach(
  mockGetUserById.stubBefore(function () {
    return []
  })
)
afterEach(mockGetUserById.stubAfter)

describe('Build - /builds/:id', function () {
  ctx = {}
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

  describe('GET', function () {
    describe('permissions', function () {
      describe('owner', function () {
        it('should return an environment build', function (done) {
          var expectedBuild = ctx.build.json()
          expectedBuild.contextVersions = [ctx.contextVersion.id()]
          expectedBuild.contexts = [ctx.context.id()]
          ctx.build.fetch(expects.success(200, expectedBuild, done))
        })
      })
      describe('non-owner', function () {
        beforeEach(function (done) { createOtherUserBuild(ctx.build, done) })
        it('should not return an environment build', function (done) {
          require('./fixtures/mocks/github/user-orgs')(ctx.otherUser.json().accounts.github.username, 'orgname')
          ctx.otherUserBuild.fetch(expects.errorStatus(403, done))
        })
      })
      describe('moderator', function () {
        beforeEach(function (done) { createModeratorBuild(ctx.build, done) })
        it('should return an environment build', function (done) {
          var expectedBuild = ctx.build.json()
          expectedBuild.contextVersions = [ctx.contextVersion.id()]
          expectedBuild.contexts = [ctx.context.id()]
          ctx.moderatorBuild.fetch(expects.success(200, expectedBuild, done))
        })
      })
    })
    describe('errors', function () {
      it('should fail with 404 if not found', function (done) {
        ctx.user.newBuild(ctx.user.id()).fetch(expects.error(404, /not found/, done))
      })
    })
  })
})

// describe('Build - /projects/:id/environments/:id/builds/:id/build', function() {
//   ctx = {}

//   before(api.start.bind(ctx))
//   after(api.stop.bind(ctx))
//   afterEach(require('./fixtures/clean-mongo').removeEverything)
//   afterEach(require('./fixtures/clean-ctx')(ctx))
//   afterEach(require('./fixtures/clean-nock'))

//   describe('POST', function () {
//     beforeEach(function (done) {
//       multi.createContextVersion(function (err, contextVersion, version, build, env, project, user) {
//         ctx.contextVersion = contextVersion
//         ctx.build = build
//         ctx.user = user
//         done(err)
//       })
//     })

//     it('should return an environment build', function (done) {
//       require('./fixtures/mocks/docker/container-id-attach')()
//       ctx.build.build(ctx.buildId, {message: 'hello!'}, function (err, body, code) {
//         if (err) {
//           return done(err)
//         }

//         expect(code).to.equal(201)
//         expect(body).to.exist()

//         tailBuildStream(body.contextVersions[0], function (err, log) {
//           if (err) {
//             return done(err)
//           }

//           expect(log).to.contain('Successfully built')

//           var count = createCount(2, done)
//           var buildExpected = {
//             completed: exists
//           }
//           require('./fixtures/mocks/github/user')(ctx.user)
//           ctx.build.fetch(expects.success(200, buildExpected, count.next))
//           var versionExpected = {
//             'dockerHost': exists,
//             'build.message': exists,
//             'build.started': exists,
//             'build.completed': exists,
//             'build.dockerImage': exists,
//             'build.dockerTag': exists,
//             'build.triggeredAction.manual': true
//           }
//           require('./fixtures/mocks/github/user')(ctx.user)
//           ctx.contextVersion.fetch(expects.success(200, versionExpected, count.next))
//         })
//       })
//     })
//     describe('built', function() {
//       beforeEach(function (done) {
//         multi.createBuiltBuild(function (err, build, env, project, user, modelArr) {
//           ctx.build = build
//           ctx.contextVersion = modelArr[0]
//           ctx.user = user
//           require('./fixtures/mocks/github/user')(ctx.user)
//           done(err)
//         })
//       })
//       it('should return a build with contextVersions (w/ usernames) populated',
//         function (done) {
//           var expected = ctx.build.json()
//           expected.duration = exists
//           expected.contextVersions = [
//             ctx.contextVersion.json()
//           ]
//           expected.contextVersions[0].build.triggeredBy.username =
//             ctx.user.json().accounts.github.username
//           expected.contextVersions[0].build.triggeredBy.gravatar =
//             ctx.user.json().gravatar
//           ctx.build.fetch(expects.success(200, expected, done))
//         })
//     })
//   })
// })
