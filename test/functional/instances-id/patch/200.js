/**
 * @module test/instances-id/patch/200
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')

var api = require('../../fixtures/api-control')
var createCount = require('callback-count')
var dock = require('../../fixtures/dock')
var multi = require('../../fixtures/multi-factory')
var primus = require('../../fixtures/primus')
var dockerMockEvents = require('../../fixtures/docker-mock-events')

var after = lab.after
var afterEach = lab.afterEach
var before = lab.before
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it
var sinon = require('sinon')
var rabbitMQ = require('models/rabbitmq')
var InstanceService = require('models/services/instance-service')
var mockGetUserById = require('../../fixtures/mocks/github/getByUserId')
var uuid = require('uuid')

function expectInstanceUpdated (body, statusCode, user, build, cv) {
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
  var deepContain = {
    build: build,
    contextVersion: cv,
    contextVersions: [ cv ], // legacy support for now
    owner: owner,
    containers: [],
    autoForked: false,
    masterPod: false
  }
  expect(body).deep.contain(deepContain)
}

describe('200 PATCH /instances/:id', function () {
  var ctx = {}
  // before
  before(api.start.bind(ctx))
  before(dock.start.bind(ctx))
  before(require('../../fixtures/mocks/api-client').setup)
  beforeEach(primus.connect)

  before(function (done) {
    // prevent worker to be created
    sinon.stub(rabbitMQ, 'deleteInstance', function () {})
    done()
  })

  after(function (done) {
    rabbitMQ.deleteInstance.restore()
    done()
  })

  // after
  afterEach(primus.disconnect)
  after(api.stop.bind(ctx))
  after(dock.stop.bind(ctx))
  after(require('../../fixtures/mocks/api-client').clean)
  afterEach(require('../../fixtures/clean-mongo').removeEverything)
  afterEach(require('../../fixtures/clean-ctx')(ctx))
  afterEach(require('../../fixtures/clean-nock'))

  beforeEach(
    mockGetUserById.stubBefore(function () {
      var array = [{
        id: 1001,
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
  describe('For User', function () {
    describe('with in-progress build', function () {
      beforeEach(function (done) {
        multi.createContextVersion(function (err, cv, context, build, user) {
          if (err) { return done(err) }
          ctx.build = build
          ctx.cv = cv
          ctx.user = user
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
      beforeEach(function (done) {
        // create instance
        ctx.instance = ctx.user.createInstance({
          json: {
            name: uuid(),
            build: ctx.build.id()
          }
        }, function (err) {
          done(err)
        })
      })
      afterEach(function (done) {
        require('../../fixtures/clean-mongo').removeEverything(done)
      })

      it('should update an instance with a build', function (done) {
        var count = createCount(2, done)
        sinon.spy(InstanceService, 'deleteForkedInstancesByRepoAndBranch')
        // Original patch from the update route, then the one at the end of the on-build-die
        primus.expectAction('start', {}, function () {
          expect(InstanceService.deleteForkedInstancesByRepoAndBranch.callCount).to.equal(1)
          var acv = ctx.cv.appCodeVersions.models[0].attrs
          var args = InstanceService.deleteForkedInstancesByRepoAndBranch.getCall(0).args
          expect(args[0]._id.toString()).to.equal(ctx.instance.id().toString())
          expect(args[1]).to.equal(acv.lowerRepo)
          expect(args[2]).to.equal(acv.lowerBranch)
          InstanceService.deleteForkedInstancesByRepoAndBranch.restore()
          count.next()
        })
        ctx.instance.update({
          env: ['ENV=OLD'],
          build: ctx.build.id()
        }, function (err, body, statusCode) {
          if (err) { return done(err) }
          expectInstanceUpdated(body, statusCode, ctx.user, ctx.build, ctx.cv)
          // wait until build is ready to finish the test
          primus.onceVersionComplete(ctx.cv.id(), function () {
            count.next()
          })
          dockerMockEvents.emitBuildComplete(ctx.cv)
        })
      })

      it('should update an instance with name, build, env', function (done) {
        var count = createCount(2, done)
        var name = 'CustomName'
        var env = ['one=one', 'two=two', 'three=three']
        // Original patch from the update route, then the one at the end of the on-build-die
        primus.expectAction('start', {}, count.next)
        ctx.instance.update({
          build: ctx.build.id(),
          name: name,
          env: env
        }, function (err, body, statusCode) {
          if (err) { return done(err) }
          expectInstanceUpdated(body, statusCode, ctx.user, ctx.build, ctx.cv)
          // wait until build is ready to finish the test

          primus.onceVersionComplete(ctx.cv.id(), function () {
            count.next()
          })
          dockerMockEvents.emitBuildComplete(ctx.cv)
        })
      })

      it('should update an instance with an ipWhitelist change', function (done) {
        ctx.instance.update({
          ipWhitelist: {
            enabled: true
          }
        }, function (err, body) {
          if (err) { return done(err) }
          expect(body.ipWhitelist).to.be.object()
          expect(body.ipWhitelist.enabled).to.be.true()
          // Just to verify
          ctx.instance.fetch(function (err) {
            if (err) { return done(err) }
            expect(ctx.instance.attrs.ipWhitelist).to.be.object()
            expect(ctx.instance.attrs.ipWhitelist.enabled).to.be.true()
            done()
          })
        })
      })
    })
  })
})
