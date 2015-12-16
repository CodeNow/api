'use strict'

var sinon = require('sinon')
var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach

var Instance = require('models/mongo/instance')
var api = require('../../fixtures/api-control')
var dock = require('../../fixtures/dock')
var mockGetUserById = require('../../fixtures/mocks/github/getByUserId')
var multi = require('../../fixtures/multi-factory')
var expects = require('../../fixtures/expects')
var primus = require('../../fixtures/primus')
var rabbitMQ = require('models/rabbitmq')

describe('DELETE /instances/:id', function () {
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
  beforeEach(function (done) {
    multi.createAndTailInstance(primus, function (err, instance, build, user) {
      if (err) { return done(err) }
      ctx.instance = instance
      ctx.build = build
      ctx.user = user
      require('../../fixtures/mocks/github/user')(ctx.user)
      require('../../fixtures/mocks/github/user')(ctx.user)
      done()
    })
  })

  describe('DELETE', function () {
    describe('permissions', function () {
      describe('owner', function () {
        it('should delete the instance', function (done) {
          require('../../fixtures/mocks/github/user-id')(ctx.user.attrs.accounts.github.id,
            ctx.user.attrs.accounts.github.login)
          ctx.instance.destroy(expects.success(204, done))
        })
      })
      describe('non-owner', function () {
        beforeEach(function (done) {
          // TODO: remove when I merge in the github permissions stuff
          require('../../fixtures/mocks/github/user-orgs')(100, 'otherOrg')
          ctx.nonOwner = multi.createUser(done)
        })
        it('should not delete the instance (403 forbidden)', function (done) {
          ctx.instance.client = ctx.nonOwner.client // swap auth to nonOwner's
          ctx.instance.destroy(expects.errorStatus(403, done))
        })
      })
      describe('moderator', function () {
        beforeEach(function (done) {
          ctx.moderator = multi.createModerator(done)
        })
        it('should delete the instance', function (done) {
          ctx.instance.client = ctx.moderator.client // swap auth to moderator's
          require('../../fixtures/mocks/github/user-id')(ctx.moderator.attrs.accounts.github.id,
            ctx.moderator.attrs.accounts.github.login)
          ctx.instance.destroy(expects.success(204, done))
        })
      })
    })

    describe('not founds', function () {
      beforeEach(function (done) {
        Instance.removeById(ctx.instance.id(), done)
      })
      it('should not delete the instance if missing (404 instance)', function (done) {
        ctx.user.destroyInstance(ctx.instance.id(), expects.errorStatus(404, done))
      })
    })
  })
})
