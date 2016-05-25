/**
 * @module test/instances-id-actions-restart/put/index
 */
'use strict'

var Lab = require('lab')
var Code = require('code')

var lab = exports.lab = Lab.script()

var after = lab.after
var afterEach = lab.afterEach
var before = lab.before
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var Container = require('dockerode/lib/container')
var createCount = require('callback-count')
var exists = require('101/exists')
var uuid = require('uuid')

var Docker = require('models/apis/docker')
var api = require('../../fixtures/api-control')
var dock = require('../../fixtures/dock')
var dockerMockEvents = require('../../fixtures/docker-mock-events')
var expects = require('../../fixtures/expects')
var mockGetUserById = require('../../fixtures/mocks/github/getByUserId')
var multi = require('../../fixtures/multi-factory')
var primus = require('../../fixtures/primus')
var redisCleaner = require('../../fixtures/redis-cleaner')

describe('PUT /instances/:id/actions/restart', function () {
  var ctx = {}
  var delayContainerLogsBy = function (ms, originalContainerLogs) {
    return function () {
      var container = this
      var args = arguments
      setTimeout(function () {
        originalContainerLogs.apply(container, args)
      }, ms)
    }
  }
  beforeEach(redisCleaner.clean(process.env.WEAVE_NETWORKS + '*'))
  before(api.start.bind(ctx))
  before(dock.start.bind(ctx))
  before(require('../../fixtures/mocks/api-client').setup)
  beforeEach(primus.connect)
  afterEach(primus.disconnect)
  after(api.stop.bind(ctx))
  after(dock.stop.bind(ctx))
  after(require('../../fixtures/mocks/api-client').clean)
  beforeEach(
    mockGetUserById.stubBefore(function () {
      var array = []
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
  function initExpected (done) {
    ctx.expected = {
      _id: exists,
      shortHash: exists,
      'createdBy.github': ctx.user.attrs.accounts.github.id,
      name: exists,
      env: [],
      owner: {
        username: ctx.user.json().accounts.github.login,
        gravatar: ctx.user.json().gravatar,
        github: ctx.user.json().accounts.github.id
      },
      contextVersions: exists,
      'build._id': ctx.build.id(),
      'contextVersions[0]._id': ctx.cv.id()
    }
    done()
  }

  describe('for User', function () {
    describe('create instance with in-progress build', function () {
      beforeEach(function (done) { // delay container log time to make build time longer
        ctx.originalContainerLogs = Container.prototype.logs
        Container.prototype.logs = delayContainerLogsBy(500, ctx.originalContainerLogs)
        done()
      })
      afterEach(function (done) { // restore original container log method
        Container.prototype.logs = ctx.originalContainerLogs
        done()
      })
      beforeEach(function (done) {
        multi.createContextVersion(function (err, contextVersion, context, build, user) {
          if (err) {
            return done(err)
          }
          ctx.build = build
          ctx.user = user
          ctx.cv = contextVersion
          done()
        })
      })
      beforeEach(function (done) {
        initExpected(function () {
          ctx.expectNoContainerErr = true
          done()
        })
      })
      createInstanceAndRunTests(ctx)
    })
  })
  function createInstanceAndRunTests (ctx) {
    describe('and env.', function () {
      beforeEach(function (done) {
        primus.joinOrgRoom(ctx.user.json().accounts.github.id, done)
      })
      beforeEach(function (done) {
        var body = {
          name: uuid(),
          env: ['ENV=OLD'],
          build: ctx.build.id(),
          masterPod: true
        }
        ctx.expected.env = body.env
        ctx.expected['build._id'] = body.build
        if (ctx.expectNoContainerErr) {
          done()
        } else {
          var count = createCount(2, function () {
            ctx.instance.fetch(done)
          })
          primus.expectAction('start', {}, count.next)
          ctx.instance = ctx.user.createInstance(body, expects.success(201, ctx.expected, count.next))
        }
      })
      restartInstanceTests(ctx)
    })
    describe('and no env.', function () {
      beforeEach(function (done) {
        primus.joinOrgRoom(ctx.user.json().accounts.github.id, done)
      })
      beforeEach(function (done) {
        var body = {
          name: uuid(),
          build: ctx.build.id(),
          masterPod: true
        }
        if (ctx.expectNoContainerErr) {
          done()
        } else {
          var count = createCount(2, function () {
            ctx.instance.fetch(done)
          })
          primus.expectAction('start', {}, count.next)
          ctx.instance = ctx.user.createInstance(body, expects.success(201, ctx.expected, count.next))
        }
      })
      restartInstanceTests(ctx)
    })
  }

  function restartInstanceTests (ctx) {
    afterEach(require('../../fixtures/clean-ctx')(ctx))
    afterEach(require('../../fixtures/clean-nock'))
    afterEach(require('../../fixtures/clean-mongo').removeEverything)

    it('should restart an instance', function (done) {
      if (ctx.originalStart) { // restore docker back to normal - immediately exiting container will now start
        Docker.prototype.startContainer = ctx.originalStart
        ctx.expected['containers[0].inspect.State.Running'] = true
      }
      if (ctx.expectNoContainerErr) {
        ctx.build.build({ message: uuid() }, function () {
          var body = {
            name: uuid(),
            build: ctx.build.id(),
            masterPod: true
          }
          ctx.instance = ctx.user.createInstance(body, function (err) {
            if (err) {
              return done(err)
            }
            ctx.instance.restart(expects.error(400, /not have a container/, function () {
              var count = createCount(done)
              primus.expectActionCount('restart', 1, count.inc().next)
              primus.expectActionCount('start', 1, count.inc().next)
              primus.onceVersionComplete(ctx.cv.id(), function () {
                count.next()
              })
              dockerMockEvents.emitBuildComplete(ctx.cv)
            }))
          })
        })
      } else { // success
        var count = createCount(3, stopRestartAssert)
        primus.expectActionCount('start', 1, count.next)
        primus.expectAction('starting', {
          container: {inspect: {State: {Starting: true}}}
        }, count.next)
        ctx.instance.restart(expects.success(200, ctx.expected, stopRestartAssert))
      }
      function stopRestartAssert (err) {
        if (err) { return done(err) }
        var count = createCount(done)
        var instance = ctx.instance

        count.inc()

        expects.updatedHosts(ctx.user, instance, count.inc().next)
        // try stop and start

        count.inc()
        count.inc()
        primus.expectAction('stopping', {
          container: {inspect: {State: {Stopping: true}}}
        }, count.next)

        instance.stop(expects.success(200, function (err) {
          if (err) { return count.next(err) }
          // expect temporary property to not be in final response
          expect(instance.json().container.inspect.State.Stopping).to.be.undefined()
          expect(instance.json().container.inspect.State.Starting).to.be.undefined()
          primus.expectActionCount('stop', 1, function () {
            instance.restart(expects.success(200, ctx.expected, function (err) {
              if (err) { return count.next(err) }
              count.inc()
              primus.expectActionCount('restart', 1, count.next)
              primus.expectActionCount('start', 1, function () {
                // expect temporary property to not be in final response
                expect(instance.json().container.inspect.State.Stopping).to.be.undefined()
                expect(instance.json().container.inspect.State.Starting).to.be.undefined()
                expects.updatedHosts(ctx.user, instance, count.next)
              })
            }))
          })
        }))
      }
    })
  }
})
