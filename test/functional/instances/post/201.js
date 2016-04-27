/**
 * @module test/instances/post/201
 */
'use strict'

var Code = require('code')
var Lab = require('lab')
var createCount = require('callback-count')
var sinon = require('sinon')
var uuid = require('uuid')

var rabbitMQ = require('models/rabbitmq')

var api = require('../../fixtures/api-control')
var dock = require('../../fixtures/dock')
var expects = require('../../fixtures/expects')
var multi = require('../../fixtures/multi-factory')
var primus = require('../../fixtures/primus')
var mockGetUserById = require('../../fixtures/mocks/github/getByUserId')
var dockerMockEvents = require('../../fixtures/docker-mock-events')
var lab = exports.lab = Lab.script()

var after = lab.after
var afterEach = lab.afterEach
var before = lab.before
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var ctx = {
  expected: {}
}

function assertCreate (body, done) {
  ctx.instance = ctx.user.createInstance(body,
    expects.success(201, ctx.expected, function (err) {
      if (err) { return done(err) }
      if (!ctx.afterPostAsserts || ctx.afterPostAsserts.length === 0) {
        return done()
      }
      var count = createCount(ctx.afterPostAsserts.length, done)
      ctx.afterPostAsserts.forEach(function (assert) {
        assert(count.next)
      })
    }))
}

function expectInstanceCreated (body, statusCode, user, build, cv) {
  user = user.json()
  build = build.json()
  cv = cv.json()
  delete cv.build.log
  var owner = {
    github: user.accounts.github.id,
    username: user.accounts.github.login,
    gravatar: user.gravatar
  }
  expect(body._id).to.exist()
  expect(body.shortHash).to.exist()
  expect(body.name).to.exist()
  expect(body.lowerName).to.equal(body.name.toLowerCase())
  expect(body).deep.contain({
    build: build,
    contextVersion: cv,
    contextVersions: [ cv ], // legacy support for now
    owner: owner,
    containers: [],
    autoForked: false,
    masterPod: false
  })
}

beforeEach(
  mockGetUserById.stubBefore(function () {
    var array = [{
      id: 11111,
      username: 'Runnable'
    }]
    if (ctx.user) {
      array.push({
        id: ctx.user.attrs.accounts.github.id,
        username: ctx.user.attrs.accounts.github.username
      })
    }
    return array
  })
)
afterEach(mockGetUserById.stubAfter)

describe('201 POST /instances', function () {
  // before
  before(api.start.bind(ctx))
  before(dock.start.bind(ctx))
  before(require('../../fixtures/mocks/api-client').setup)
  beforeEach(primus.connect)
  // after

  afterEach(primus.disconnect)
  afterEach(require('../../fixtures/clean-ctx')(ctx))
  afterEach(require('../../fixtures/clean-nock'))
  afterEach(require('../../fixtures/clean-mongo').removeEverything)

  after(api.stop.bind(ctx))
  after(dock.stop.bind(ctx))
  after(require('../../fixtures/mocks/api-client').clean)

  beforeEach(function (done) {
    sinon.stub(rabbitMQ, 'instanceDeployed').returns()
    done()
  })

  afterEach(function (done) {
    rabbitMQ.instanceDeployed.restore()
    done()
  })

  describe('For User', function () {
    describe('with in-progress build', function () {
      beforeEach(function (done) {
        multi.createContextVersion(function (err, cv, context, build, user) {
          if (err) { return done(err) }
          ctx.user = user
          ctx.build = build
          ctx.cv = cv
          done()
        })
      })
      beforeEach(function (done) {
        primus.joinOrgRoom(ctx.user.attrs.accounts.github.id, done)
      })
      beforeEach(function (done) {
        primus.onceVersionBuildRunning(ctx.cv.id(), function () {
          ctx.cv.fetch(done) // used in assertions
        })
        ctx.build.build(function (err) {
          if (err) { return done(err) }
        })
      })

      it('should create a private instance by default', function (done) {
        var name = uuid()
        var env = [
          'FOO=BAR'
        ]
        var body = {
          name: name,
          build: ctx.build.id(),
          env: env
        }

        assertCreate(body, function () {
          expect(ctx.instance.attrs.public).to.equal(false)
          expect(ctx.instance.attrs.masterPod).to.equal(false)
          primus.onceVersionComplete(ctx.cv.id(), function () {
            done()
          })
          dockerMockEvents.emitBuildComplete(ctx.cv)
        })
      })

      it('should make a master pod instance', function (done) {
        var name = uuid()
        var body = {
          name: name,
          build: ctx.build.id(),
          masterPod: true
        }

        assertCreate(body, function () {
          primus.onceVersionComplete(ctx.cv.id(), function () {
            sinon.assert.notCalled(rabbitMQ.instanceDeployed)
            done()
          })
          dockerMockEvents.emitBuildComplete(ctx.cv)
        })
      })

      it('should create an instance with a build', function (done) {
        ctx.user.createInstance({ build: ctx.build.id() }, function (err, body, statusCode) {
          if (err) { return done(err) }
          expectInstanceCreated(body, statusCode, ctx.user, ctx.build, ctx.cv)
          primus.onceVersionComplete(ctx.cv.id(), function () {
            done()
          })
          dockerMockEvents.emitBuildComplete(ctx.cv)
        })
      })

      it('should create an instance with name, build, env', function (done) {
        var name = 'CustomName'
        var env = ['one=one', 'two=two', 'three=three']
        ctx.user.createInstance({ build: ctx.build.id(), name: name, env: env }, function (err, body, statusCode) {
          if (err) { return done(err) }
          expectInstanceCreated(body, statusCode, ctx.user, ctx.build, ctx.cv)
          primus.onceVersionComplete(ctx.cv.id(), function () {
            done()
          })
          dockerMockEvents.emitBuildComplete(ctx.cv)
        })
      })
      it('should create an instance with name, build, ipWhitelist', function (done) {
        var name = 'CustomName'
        ctx.user.createInstance({
          build: ctx.build.id(),
          name: name,
          ipWhitelist: {
            enabled: true
          }
        }, function (err, body) {
          if (err) { return done(err) }
          expect(body.ipWhitelist).to.deep.equal({
            enabled: true
          })
          primus.onceVersionComplete(ctx.cv.id(), function () {
            done()
          })
          dockerMockEvents.emitBuildComplete(ctx.cv)
        })
      })
    })

    describe('with built build', function () {
      beforeEach(function (done) {
        sinon.spy(rabbitMQ, 'createInstanceContainer')
        multi.createBuiltBuild(function (err, build, user, models) {
          if (err) { return done(err) }
          ctx.user = user
          ctx.build = build
          ctx.cv = models[0]
          done()
        })
      })
      afterEach(function (done) {
        rabbitMQ.createInstanceContainer.restore()
        done()
      })

      it('should create an instance with a build', function (done) {
        var count = createCount(2, done)

        primus.expectActionCount('start', 1, count.next)
        ctx.user.createInstance({ build: ctx.build.id() }, function (err, body, statusCode) {
          if (err) { return done(err) }
          expectInstanceCreated(body, statusCode, ctx.user, ctx.build, ctx.cv)
          ctx.body = body
          sinon.assert.notCalled(rabbitMQ.instanceDeployed)
          var jobData = rabbitMQ.createInstanceContainer.getCall(0).args[0]
          expect(rabbitMQ.createInstanceContainer.calledOnce).to.be.true()
          expect(jobData.instanceId.toString()).to.equal(body._id.toString())
          expect(jobData.contextVersionId.toString()).to.equal(ctx.cv.attrs._id.toString())
          expect(jobData.sessionUserGithubId).to.equal(ctx.user.attrs.accounts.github.id)
          expect(jobData.ownerUsername).to.equal(ctx.user.attrs.accounts.github.username)
          count.next()
        })
      })

      it('should create an instance with a name, build, env', function (done) {
        var count = createCount(2, done)
        primus.expectActionCount('start', 1, count.next)
        var name = 'CustomName'
        var env = ['one=one', 'two=two', 'three=three']
        ctx.user.createInstance({ build: ctx.build.id(), name: name, env: env }, function (err, body, statusCode) {
          if (err) { return done(err) }
          expect(body.name).to.equal(name)
          expect(body.env).to.deep.equal(env)
          expectInstanceCreated(body, statusCode, ctx.user, ctx.build, ctx.cv)
          count.next()
        })
      })
    })
  })
})
