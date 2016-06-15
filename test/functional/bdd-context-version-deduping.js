/**
 * @module test/bdd-context-version-deduping
 */
'use strict'

var Code = require('code')
var Lab = require('lab')
var async = require('async')
var createCount = require('callback-count')
var randStr = require('randomstring').generate
var uuid = require('uuid')

var lab = exports.lab = Lab.script()
var after = lab.after
var afterEach = lab.afterEach
var before = lab.before
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var api = require('./fixtures/api-control')
var dock = require('./fixtures/dock')
var dockerMockEvents = require('./fixtures/docker-mock-events')
var mockGetUserById = require('./fixtures/mocks/github/getByUserId')
var multi = require('./fixtures/multi-factory')
var primus = require('./fixtures/primus')
var InstanceService = require('models/services/instance-service')
var User = require('models/mongo/user')

function cloneInstance (data, instance, user, cb) {
  var body = {}
  var parentInstance = instance
  body.parent = parentInstance.shortHash
  if (data.build && data.build._id) {
    body.build = data.build._id.toString()
  }
  body.env = data.env || parentInstance.env
  body.owner = data.owner || parentInstance.owner
  body.masterPod = body.masterPod || parentInstance.masterPod
  return User.findByIdAsync(user.attrs._id).then(function (sessionUser) {
    return InstanceService.createInstance(body, user)
      .asCallback(cb)
  })
}
/**
 * This tests many of the different possibilities that can happen during build, namely when deduping
 * occurs
 */
describe('Building - Context Version Deduping', function () {
  var ctx = {}

  /**
   * What needs testing
   *
   * - Create instance from in-progress build, should deploy when finished
   * - Fork instance with finished build, should deploy
   * - Fork instance with failed build, should not deploy
   * - Fork instance with in-progress build, should deploy both when successful
   * - Fork instance with in-progress build, shouldn't deploy when failed
   */

  before(api.start.bind(ctx))
  before(dock.start.bind(ctx))
  before(require('./fixtures/mocks/api-client').setup)
  beforeEach(require('./fixtures/clean-nock'))
  beforeEach(primus.connect)

  afterEach(primus.disconnect)
  after(api.stop.bind(ctx))
  after(dock.stop.bind(ctx))
  after(require('./fixtures/mocks/api-client').clean)
  beforeEach(
    mockGetUserById.stubBefore(function () {
      return []
    })
  )
  afterEach(mockGetUserById.stubAfter)
  describe('In-progress build', function () {
    beforeEach(function (done) {
      multi.createContextVersion(function (err, contextVersion, context, build, user) {
        if (err) { return done(err) }
        ctx.build = build
        ctx.user = user
        ctx.cv = contextVersion
        done()
      })
    })
    beforeEach(function (done) {
      primus.joinOrgRoom(ctx.user.json().accounts.github.id, done)
    })
    // start build here, send  dockerMockEvents.emitBuildComplete to end
    beforeEach(function (done) {
      ctx.build.build({ message: uuid() }, done)
    })
    beforeEach(function (done) {
      primus.onceVersionBuildRunning(ctx.cv.id(), function () {
        done()
      })
    })
    it('should fork the instance, and both should be deployed when the build is finished', function (done) {
      // Add it to an instance
      var json = { build: ctx.build.id(), name: randStr(5) }

      var count = createCount(1, function () {
        async.parallel([
          instance.fetch.bind(instance),
          forkedInstance.fetch.bind(forkedInstance)
        ], function (err) {
          if (err) { return done(err) }
          expect(instance.attrs.containers[0].inspect.State.Running).to.exist()
          expect(forkedInstance.attrs.containers[0].inspect.State.Running).to.exist()
          done()
        })
      })
      primus.expectActionCount('start', 2, count.next)

      var forkedInstance
      var instance = ctx.user.createInstance({ json: json }, function (err) {
        if (err) { return done(err) }
        // Now fork that instance
        cloneInstance({ name: uuid() }, instance, ctx.user, function (err, inst) {
          if (err) { return done(err) }
          // Now tail both and make sure they both start
          dockerMockEvents.emitBuildComplete(ctx.cv)
        })
      })
    })
    it('should fork the instance, and but not deploy since the build will fail', function (done) {
      // Add it to an instance
      var json = { build: ctx.build.id(), name: randStr(5) }
      var instance = ctx.user.createInstance({ json: json }, function (err) {
        if (err) { return done(err) }
        // Now fork that instance
        cloneInstance({ name: uuid() }, instance, ctx.user, function (err, inst) {
          if (err) { return done(err) }
          // since the build will fail we must rely on version complete, versus instance deploy socket event
          primus.onceVersionComplete(ctx.cv.id(), function () {
            var count = createCount(2, done)
            instance.fetch(assertInstanceHasNoContainers)
            forkedInstance.fetch(assertInstanceHasNoContainers)
            function assertInstanceHasNoContainers (err, instance) {
              if (err) { return count.next(err) }
              expect(instance.containers).to.have.length(0)
              count.next()
            }
          })
          // Now tail the buildstream so we can check if the instances do not deploy
          dockerMockEvents.emitBuildComplete(ctx.cv, true)
        })
      })
    })
    it('should fork after failure, so the instance should not deploy', function (done) {
      // Add it to an instance
      var json = { build: ctx.build.id(), name: randStr(5) }
      var instance = ctx.user.createInstance({ json: json }, function (err) {
        if (err) { return done(err) }
        // Now wait for the finished build
        // since the build will fail we must rely on version complete, versus instance deploy socket event
        primus.onceVersionComplete(ctx.cv.id(), function () {
          cloneInstance({ name: uuid() }, instance, ctx.user, function (err, inst) {
            if (err) { return done(err) }
            forkedInstance = inst
            var count = createCount(2, done)
            instance.fetch(assertInstanceHasNoContainers)
            forkedInstance.fetch(assertInstanceHasNoContainers)
            function assertInstanceHasNoContainers (err, instance) {
              if (err) { return count.next(err) }
              expect(instance.containers).to.have.length(0)
              count.next()
            }
          })
        })
        // finish the build
        dockerMockEvents.emitBuildComplete(ctx.cv, true)
      })
    })
  })
  describe('fork instance with finished build', function () {
    beforeEach(function (done) {
      multi.createBuiltBuild(function (err, build, user, modelArray) {
        if (err) { return done(err) }
        ctx.build = build
        ctx.user = user
        ctx.cv = modelArray[0]
        done()
      })
    })
    it('should deploy right after', function (done) {
      // start the build
      // Add it to an instance
      var json = { build: ctx.build.id(), name: randStr(5) }
      var count = createCount(1, function () {
        async.parallel([
          instance.fetch.bind(instance),
          forkedInstance.fetch.bind(forkedInstance)
        ], function (err) {
          if (err) { return done(err) }
          expect(instance.attrs.containers[0].inspect.State.Running).to.exist()
          expect(forkedInstance.containers[0].inspect.State.Running).to.exist()
          done()
        })
      })
      primus.expectActionCount('start', 2, count.next)

      var forkedInstance
      var instance = ctx.user.createInstance({ json: json }, function (err) {
        if (err) { return done(err) }
        cloneInstance(json, instance, ctx.user, function (err, inst) {
          if (err) { return done(err) }
          forkedInstance = inst
        })
      })
    })
  })
})
