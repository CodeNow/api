/**
 * @module test/instances-id/patch/index
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach

var createCount = require('callback-count')
var nock = require('nock')

var api = require('../../fixtures/api-control')
var dock = require('../../fixtures/dock')
var expects = require('../../fixtures/expects')
var mockGetUserById = require('../../fixtures/mocks/github/getByUserId')
var multi = require('../../fixtures/multi-factory')
var primus = require('../../fixtures/primus')
var sinon = require('sinon')
var rabbitMQ = require('models/rabbitmq')

describe('Instance - PATCH /instances/:id', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  before(dock.start.bind(ctx))
  beforeEach(primus.connect)
  afterEach(primus.disconnect)
  after(api.stop.bind(ctx))
  after(dock.stop.bind(ctx))
  afterEach(require('../../fixtures/clean-mongo').removeEverything)
  afterEach(require('../../fixtures/clean-ctx')(ctx))
  afterEach(require('../../fixtures/clean-nock'))

  before(function (done) {
    // prevent worker to be created
    sinon.stub(rabbitMQ, 'deleteInstance', function () {})
    done()
  })

  after(function (done) {
    rabbitMQ.deleteInstance.restore()
    done()
  })

  beforeEach(
    mockGetUserById.stubBefore(function () {
      var array = [{
        id: 1001,
        username: 'Runnable'
      }, {
        id: 100,
        username: 'otherOrg'
      }]
      if (ctx.user) {
        array.push({
          id: ctx.user.attrs.accounts.github.id,
          username: ctx.user.attrs.accounts.github.username
        })
      }
      if (ctx.moderator) {
        array.push({
          id: ctx.moderator.attrs.accounts.github.id,
          username: ctx.moderator.attrs.accounts.github.username
        })
      }
      if (ctx.nonOwner) {
        array.push({
          id: ctx.nonOwner.attrs.accounts.github.id,
          username: ctx.nonOwner.attrs.accounts.github.username
        })
      }
      return array
    })
  )
  afterEach(mockGetUserById.stubAfter)
  /**
   * Patching has a couple of different jobs.  It allows the user to edit the name of the instance,
   * modify it's public/private flag, and now, change it's build.  These tests should not only
   * verify the user can change all of these individually, they should also test everything can
   * be modified all at once
   */
  describe('PATCH', function () {
    describe('Orgs', function () {
      beforeEach(function (done) {
        ctx.orgId = 1001
        var next = createCount(2, done).next
        primus.expectAction('start', next)
        multi.createAndTailInstance(primus, ctx.orgId, function (err, instance, build, user, mdlArray, srcArray) {
          if (err) { return next(err) }
          ctx.instance = instance
          ctx.build = build
          ctx.user = user
          ctx.cv = mdlArray[0]
          ctx.context = mdlArray[1]
          ctx.srcArray = srcArray
          multi.createBuiltBuild(ctx.user.attrs.accounts.github.id, function (err, build) {
            if (err) { return next(err) }
            ctx.otherBuild = build
            next()
          })
        })
      })
      it('should not allow a user-owned build to be patched to an org-owned instance', function (done) {
        nock.cleanAll()
        require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
        require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
        require('../../fixtures/mocks/github/user')(ctx.user)
        var update = {
          build: ctx.otherBuild.id().toString()
        }
        require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
        ctx.instance.update(update, expects.error(400, /owner/, done))
      })
    })
  })
})
