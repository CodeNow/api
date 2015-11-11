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

describe('201 POST /instances', function () {
  // before
  before(api.start.bind(ctx))
  before(dock.start.bind(ctx))
  before(require('../../fixtures/mocks/api-client').setup)
  beforeEach(primus.connect)
  // after

  after(api.stop.bind(ctx))
  after(dock.stop.bind(ctx))
  after(require('../../fixtures/mocks/api-client').clean)
  afterEach(primus.disconnect)
  afterEach(require('../../fixtures/clean-mongo').removeEverything)
  // afterEach(require('../../fixtures/clean-ctx')(ctx))
  // afterEach(require('../../fixtures/clean-nock'))

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
        ctx.build.build(function (err) {
          if (err) { return done(err) }
          ctx.cv.fetch(done) // used in assertions
        })
      })
      afterEach(function (done) {
        require('../../fixtures/clean-mongo').removeEverything(done)
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
        // ctx.expected.name = name
        // ctx.expected.env = env
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
        // ctx.expected.name = name
        // ctx.expected.masterPod = true
        assertCreate(body, function () {
          // expect(ctx.instance.attrs.public).to.equal(false)
          // expect(ctx.instance.attrs.masterPod).to.equal(true)
          primus.onceVersionComplete(ctx.cv.id(), function () {
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
    })

    describe('with built build', function () {
      beforeEach(function (done) {
        multi.createBuiltBuild(function (err, build, user, models) {
          if (err) { return done(err) }
          ctx.user = user
          ctx.build = build
          ctx.cv = models[0]
          done()
        })
      })
      it('should create an instance with a build', function (done) {
        var count = createCount(2, done)
        primus.expectActionCount('start', 1, count.next)
        var rabbitmqPublishSpy = sinon.spy(rabbitMQ, 'createInstanceContainer')

        var deployCount = createCount(2, function () {
          var jobData = rabbitmqPublishSpy.getCall(0).args[0]
          expect(rabbitmqPublishSpy.calledOnce).to.be.true()
          expect(jobData.cvId).to.equal(ctx.cv.id())
          expect(jobData.dockerHost).to.exist()
          expect(jobData.instanceEnvs[0]).to.equal('RUNNABLE_CONTAINER_ID=' + ctx.instance.attrs.shortHash)
          expect(jobData.labels).to.deep.contain({
            contextVersionId: ctx.cv.id(),
            instanceId: ctx.body._id,
            instanceName: ctx.body.name,
            instanceShortHash: ctx.body.shortHash,
            creatorGithubId: ctx.user.attrs.accounts.github.id.toString(),
            ownerUsername: ctx.user.attrs.accounts.github.login,
            ownerGithubId: ctx.user.attrs.accounts.github.id.toString(),
            sessionUserGithubId: ctx.user.attrs.accounts.github.id.toString()
          })
          rabbitMQ.createInstanceContainer.restore()
          count.next()
        })
        primus.expectActionCount('deploy', 1, deployCount.next)

        ctx.user.createInstance({ build: ctx.build.id() }, function (err, body, statusCode) {
          if (err) { return done(err) }
          expectInstanceCreated(body, statusCode, ctx.user, ctx.build, ctx.cv)
          ctx.body = body
          deployCount.next()
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
