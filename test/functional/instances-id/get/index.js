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

var api = require('../../fixtures/api-control')
var dock = require('../../fixtures/dock')
var multi = require('../../fixtures/multi-factory')
var expects = require('../../fixtures/expects')
var primus = require('../../fixtures/primus')
var exists = require('101/exists')
var Instance = require('models/mongo/instance')

describe('Instance - /instances/:id', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  before(dock.start.bind(ctx))
  after(api.stop.bind(ctx))
  beforeEach(primus.connect)
  afterEach(primus.disconnect)
  after(dock.stop.bind(ctx))
  afterEach(require('../../fixtures/clean-mongo').removeEverything)
  afterEach(require('../../fixtures/clean-ctx')(ctx))
  afterEach(require('../../fixtures/clean-nock'))

  describe('ORG INSTANCES', function () {
    beforeEach(function (done) {
      ctx.orgId = 1001
      multi.createAndTailInstance(primus, ctx.orgId, function (err, instance, build, user, mdlArray, srcArray) {
        // [contextVersion, context, build, user], [srcContextVersion, srcContext, moderator]
        if (err) { return done(err) }
        ctx.instance = instance
        ctx.build = build
        ctx.user = user
        ctx.cv = mdlArray[0]
        ctx.context = mdlArray[1]
        ctx.srcArray = srcArray
        done()
      })
    })
    it('should be owned by an org', function (done) {
      require('../../fixtures/clean-nock')()
      require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
      require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
      require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
      require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
      ctx.instance.fetch(function (err, instance, statusCode) {
        expect(statusCode).to.equal(200)
        expect(instance.build._id, 'instance.build._id').to.equal(ctx.build.id())
        expect(instance.owner.github, 'instance.owner.github').to.equal(ctx.orgId)
        expect(instance.owner.username, 'instance.owner.username').to.equal('Runnable')
        done(err)
      })
    })
  })

  beforeEach(function (done) {
    multi.createAndTailInstance(primus, function (err, instance, build, user, mdlArray, srcArray) {
      // [contextVersion, context, build, user], [srcContextVersion, srcContext, moderator]
      if (err) { return done(err) }
      ctx.instance = instance
      ctx.build = build
      ctx.user = user
      ctx.cv = mdlArray[0]
      ctx.context = mdlArray[1]
      ctx.srcArray = srcArray
      done()
    })
  })
  describe('GET', function () {
    it('should populate the build', function (done) {
      var expected = {
        'build._id': ctx.build.id()
      }
      ctx.instance.fetch(expects.success(200, expected, done))
    })
    it('should inspect the containers', function (done) {
      var expected = {
        'containers[0].inspect.State.Running': true
      }
      ctx.instance.fetch(expects.success(200, expected, done))
    })
    it('should fetch by _id', function (done) {
      var expected = {
        _id: ctx.instance.attrs._id
      }
      ctx.user.fetchInstance(ctx.instance.attrs._id, expects.success(200, expected, done))
    })
    describe('permissions', function () {
      describe('public', function () {
        beforeEach(function (done) {
          require('../../fixtures/mocks/github/user')(ctx.user)
          ctx.instance.update({ json: { public: true } }, function (err) {
            ctx.expected = {}
            ctx.expected.shortHash = exists
            ctx.expected['build._id'] = ctx.build.id()
            ctx.expected['owner.username'] = ctx.user.json().accounts.github.username
            done(err)
          })
        })
        describe('owner', function () {
          it('should get the instance', function (done) {
            ctx.instance.fetch(expects.success(200, ctx.expected, done))
          })
        })
        describe('non-owner', function () {
          beforeEach(function (done) {
            ctx.nonOwner = multi.createUser(done)
          })
          it('should get the instance', function (done) {
            ctx.nonOwner.fetchInstance(ctx.instance.attrs.shortHash, expects.success(200, ctx.expected, done))
          })
        })
        describe('moderator', function () {
          beforeEach(function (done) {
            ctx.moderator = multi.createModerator(done)
          })
          it('should get the instance', function (done) {
            ctx.moderator.fetchInstance(ctx.instance.attrs.shortHash, expects.success(200, ctx.expected, done))
          })
        })
      })
      describe('private', function () {
        beforeEach(function (done) {
          require('../../fixtures/mocks/github/user')(ctx.user)
          ctx.instance.update({ json: { public: false } }, function (err) {
            ctx.expected = {}
            ctx.expected.shortHash = exists
            ctx.expected['build._id'] = ctx.build.id()
            ctx.expected['owner.username'] = ctx.user.json().accounts.github.username
            done(err)
          })
        })
        describe('owner', function () {
          it('should get the instance', function (done) {
            ctx.instance.fetch(expects.success(200, ctx.expected, done))
          })
        })
        describe('non-owner', function () {
          beforeEach(function (done) {
            require('nock').cleanAll()
            require('../../fixtures/mocks/github/user-orgs')(ctx.nonOwner, 44, 'Nope')
            ctx.nonOwner = multi.createUser(done)
          })
          it('should not get the instance (403 forbidden)', function (done) {
            ctx.nonOwner.fetchInstance(ctx.instance.attrs.shortHash, expects.error(403, /Access denied/, done))
          })
        })
        describe('moderator', function () {
          beforeEach(function (done) {
            ctx.moderator = multi.createModerator(done)
          })
          it('should get the instance', function (done) {
            ctx.moderator.fetchInstance(ctx.instance.attrs.shortHash, expects.success(200, ctx.expected, done))
          })
        })
      })
    })

    describe('not founds', function () {
      beforeEach(function (done) {
        Instance.removeById(ctx.instance.id(), done)
      })
      it('should not get the instance if missing (404)', function (done) {
        require('../../fixtures/mocks/github/user')(ctx.user)
        ctx.user.fetchInstance(ctx.instance.id(), expects.error(404, done))
      })
    })
  })
})
