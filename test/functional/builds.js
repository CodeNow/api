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
var dock = require('./fixtures/dock')
var mockGetUserById = require('./fixtures/mocks/github/getByUserId')
var multi = require('./fixtures/multi-factory')
var expects = require('./fixtures/expects')
var exists = require('101/exists')
var primus = require('./fixtures/primus')

describe('Builds - /builds', function () {
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

  beforeEach(function (done) {
    ctx.user = multi.createUser(done)
  })
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

  describe('POST', function () {
    describe('empty body', function () {
      it('should create a build', function (done) {
        var expected = {
          _id: exists,
          'owner.github': ctx.user.attrs.accounts.github.id,
          'createdBy.github': ctx.user.attrs.accounts.github.id
        }
        ctx.user.createBuild(expects.success(201, expected, done))
      })
    })
    describe('specify owner', function () {
      describe('owner is github org user is a member of', function () {
        it('should create a build', function (done) {
          var body = {
            owner: {
              github: 1
            }
          }
          var expected = {
            _id: exists,
            'owner.github': body.owner.github,
            'createdBy.github': ctx.user.attrs.accounts.github.id
          }
          require('./fixtures/mocks/github/user-orgs')(body.owner.github, 'orgname')
          ctx.user.createBuild(body, expects.success(201, expected, done))
        })
      })
      describe('owner is github org user is NOT a member of', function () {
        it('should create a build', function (done) {
          var body = {
            owner: {
              github: 1
            }
          }
          require('./fixtures/mocks/github/user-orgs')(2, 'otherorg')
          ctx.user.createBuild(body, expects.error(403, /denied/, done))
        })
      })
    })
    describe('specify contextVersions', function () {
      beforeEach(function (done) {
        multi.createContextVersion(function (err, contextVersion, context, build, user) {
          ctx.contextVersion = contextVersion
          ctx.user = user
          done(err)
        })
      })
      it('should create a build with the contextVersions', function (done) {
        var body = {
          contextVersions: [ctx.contextVersion.id()]
        }
        var expected = {
          contexts: [ctx.contextVersion.attrs.context],
          contextVersions: [ctx.contextVersion.id()]
        }
        ctx.user.createBuild(body, expects.success(201, expected, done))
      })
      describe('non-owner', function () {
        beforeEach(function (done) {
          multi.createContextVersion(function (err, contextVersion) {
            ctx.contextVersion2 = contextVersion
            done(err)
          })
        })
        it('should not create a build with the contextVersions', function (done) {
          var body = {
            contextVersions: [ctx.contextVersion2.id()]
          }
          require('./fixtures/mocks/github/user-orgs')(2, 'otherorg')
          ctx.user.createBuild(body, expects.error(400, /owner/, done))
        })
      })
    })
  })
  describe('GET', function () {
    beforeEach(function (done) {
      multi.createBuild(function (err, build, context, user) {
        if (err) { return done(err) }
        ctx.build = build
        ctx.context = context
        ctx.user = user
        done(err)
      })
    })

    it('should return the list of builds', function (done) {
      var expected = [
        ctx.build.json()
      ]
      ctx.user.fetchBuilds(expects.success(200, expected, done))
    })

    describe('filters', function () {
      beforeEach(function (done) {
        multi.createBuiltBuild(function (err, build, user, modelArr, srcArr) {
          if (err) { return done(err) }
          ctx.builtBuild = build
          ctx.user2 = user
          ctx.context2 = modelArr[1]
          ctx.srcContextVersion = srcArr[0]
          ctx.unbuiltBuild = ctx.user2.createBuild({}, done)
        })
      })
      it('should filter by context version', function (done) {
        var expected = [ctx.builtBuild.json()]
        var query = {
          contextVersions: [
            ctx.builtBuild.json().contextVersions[0]
          ]
        }
        ctx.user2.fetchBuilds(query, expects.success(200, expected, done))
      })
      it('should return the list of builds', function (done) {
        var expected = [
          ctx.builtBuild.json(),
          ctx.unbuiltBuild.json()
        ]
        ctx.user2.fetchBuilds(expects.success(200, expected, done))
      })
      it('should limit the returned list of builds', function (done) {
        var query = {
          limit: 1,
          sort: 'created'
        }
        var expected = [
          ctx.builtBuild.json()
        ]
        ctx.user2.fetchBuilds(query, expects.success(200, expected, done))
      })
      it('should limit and sort the returned list of builds', function (done) {
        var query = {
          limit: 1,
          sort: '-created'
        }
        var expected = [
          ctx.unbuiltBuild.json()
        ]
        ctx.user2.fetchBuilds(query, expects.success(200, expected, done))
      })
      it('should filter by completed return the list of built builds', function (done) {
        var expected = [
          ctx.builtBuild.json()
        ]
        var query = { completed: true }
        ctx.user2.fetchBuilds(query, expects.success(200, expected, done))
      })
      it('should filter by started return the list of started builds', function (done) {
        var expected = [
          ctx.builtBuild.json()
        ]
        var query = { started: true }
        ctx.user2.fetchBuilds(query, expects.success(200, expected, done))
      })
      it('should query builds by buildNumber', function (done) {
        var builtBuildData = ctx.builtBuild.json()
        var expected = [
          builtBuildData
        ]
        var query = {
          buildNumber: builtBuildData.buildNumber
        }
        ctx.user2.fetchBuilds(query, expects.success(200, expected, done))
      })
      // describe('sort', function() {
      //   describe('by buildNumber', function() {
      //     beforeEach(function (done) {
      //       var user = ctx.user2
      //       var body = {
      //         message: uuid(),
      //         parentBuild: ctx.builtBuild.id()
      //       }
      //       var build = ctx.user2.createBuild(body, function (err) {
      //         if (err) { return done(err) }
      //         multi.buildTheBuild(user, build, function (err) {
      //           ctx.builtBuild2 = build
      //           done(err)
      //         })
      //       })
      //     })
      //     it('should query builds (sort by buildNumber)', function (done) {
      //       var builtBuildData = ctx.builtBuild.json()
      //       var builtBuildData2 = ctx.builtBuild2.json()
      //       var expected = [
      //         builtBuildData2,
      //         builtBuildData
      //       ]
      //       var query = {
      //         started: true,
      //         sort: '-buildNumber'
      //       }
      //       require('nock').cleanAll(),
      //       require('./fixtures/mocks/github/user')(ctx.user2)
      //       require('./fixtures/mocks/github/user')(ctx.user2)
      //       ctx.env2.fetchBuilds(query, expects.success(200, expected, done))
      //     })
      //   })
      // })
      describe('permissions', function () {
        beforeEach(function (done) {
          require('./fixtures/mocks/github/user-orgs')(ctx.user)
          done()
        })
        it('should not return builds to other users', function (done) {
          require('./fixtures/mocks/github/user')(ctx.user)
          ctx.user.fetchBuilds({}, expects.success(200, [ctx.build.json()], done))
        })
        it('should not return builds to other users with query', function (done) {
          require('./fixtures/mocks/github/user')(ctx.user)
          ctx.user.fetchBuilds({started: false}, expects.success(200, [ctx.build.json()], done))
        })
      })
    })
  })
})
