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
var exists = require('101/exists')

var api = require('../../fixtures/api-control')
var dock = require('../../fixtures/dock')
var expects = require('../../fixtures/expects')
var multi = require('../../fixtures/multi-factory')
var primus = require('../../fixtures/primus')

describe('POST /instances/:id/actions/copy', function () {
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

  /**
   * This tests the copy instance route.  Since this route uses the existing copyBuild and create
   * instance routes, we don't have to test too much of their logic.  Basic copying logic should
   * be tested here
   */
  describe('Copy', function () {
    describe('owner', function () {
      it('should copy the instance, and give it the same build', function (done) {
        var count = createCount(2, done)
        var expected = {
          shortHash: exists,
          name: exists,
          public: exists,
          createdBy: { github: ctx.user.json().accounts.github.id,
            username: ctx.user.json().accounts.github.username,
          gravatar: ctx.user.json().accounts.github.avatar_url },
          owner: { github: ctx.user.json().accounts.github.id,
            username: ctx.user.json().accounts.github.username,
          gravatar: ctx.user.json().accounts.github.avatar_url },
          parent: ctx.instance.attrs.shortHash,
          'build._id': ctx.build.id(),
          containers: exists
        }
        require('../../fixtures/mocks/github/user')(ctx.user)
        primus.expectActionCount('start', 1, count.next)
        ctx.instance.copy(expects.success(201, expected, count.next))
      })
      it('should copy the instance, and give it the same build, with a new name!', function (done) {
        var count = createCount(2, done)
        var expected = {
          shortHash: exists,
          name: 'new-name-fo-shizzle',
          public: exists,
          createdBy: { github: ctx.user.json().accounts.github.id,
            username: ctx.user.json().accounts.github.username,
          gravatar: ctx.user.json().accounts.github.avatar_url },
          owner: { github: ctx.user.json().accounts.github.id,
            username: ctx.user.json().accounts.github.username,
          gravatar: ctx.user.json().accounts.github.avatar_url },
          parent: ctx.instance.attrs.shortHash,
          'build._id': ctx.build.id(),
          containers: exists
        }
        require('../../fixtures/mocks/github/user')(ctx.user)
        primus.expectActionCount('start', 1, count.next)
        ctx.instance.copy({
          json: {
            name: 'new-name-fo-shizzle'
          }
        }, expects.success(201, expected, count.next))
      })
      describe('parent has env', function () {
        beforeEach(function (done) {
          ctx.instance.update({ env: ['ONE=1'] }, expects.success(200, done))
        })
        it('should copy the instance env vars if it has them', function (done) {
          var count = createCount(2, done)
          var expected = {
            shortHash: exists,
            name: exists,
            public: exists,
            createdBy: { github: ctx.user.json().accounts.github.id,
              username: ctx.user.json().accounts.github.username,
            gravatar: ctx.user.json().accounts.github.avatar_url },
            owner: { github: ctx.user.json().accounts.github.id,
              username: ctx.user.json().accounts.github.username,
            gravatar: ctx.user.json().accounts.github.avatar_url },
            parent: ctx.instance.attrs.shortHash,
            'build._id': ctx.build.id(),
            containers: exists,
            env: ['ONE=1']
          }
          require('../../fixtures/mocks/github/user')(ctx.user)
          primus.expectActionCount('start', 1, count.next)
          ctx.instance.copy(expects.success(201, expected, count.next))
        })
        it('should accept new envs if they are sent with the copy', function (done) {
          var count = createCount(2, done)
          var expected = {
            shortHash: exists,
            name: exists,
            public: exists,
            createdBy: { github: ctx.user.json().accounts.github.id,
              username: ctx.user.json().accounts.github.username,
            gravatar: ctx.user.json().accounts.github.avatar_url },
            owner: { github: ctx.user.json().accounts.github.id,
              username: ctx.user.json().accounts.github.username,
            gravatar: ctx.user.json().accounts.github.avatar_url },
            parent: ctx.instance.attrs.shortHash,
            'build._id': ctx.build.id(),
            containers: exists,
            env: ['TWO=2']
          }
          require('../../fixtures/mocks/github/user')(ctx.user)
          var body = {
            env: expected.env
          }
          primus.expectActionCount('start', 1, count.next)
          ctx.instance.copy(body, expects.success(201, expected, count.next))
        })
      })
    })

    describe('group', function () {
      beforeEach(function (done) {
        ctx.orgId = 1001
        multi.createAndTailInstance(primus, ctx.orgId, function (err, instance, build) {
          if (err) { return done(err) }
          ctx.instance = instance
          ctx.build = build
          done()
        })
      })
      it('should copy the instance when part of org', function (done) {
        var count = createCount(2, done)
        var expected = {
          shortHash: exists,
          name: exists,
          public: exists,
          createdBy: { github: ctx.user.json().accounts.github.id,
            username: ctx.user.json().accounts.github.username,
          gravatar: ctx.user.json().accounts.github.avatar_url },
          'owner.github': ctx.orgId,
          parent: ctx.instance.attrs.shortHash,
          'build._id': ctx.build.id(),
          containers: exists
        }
        require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
        require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
        require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
        require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
        require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
        require('../../fixtures/mocks/github/user')(ctx.user)
        require('../../fixtures/mocks/github/user')(ctx.user)
        require('../../fixtures/mocks/github/user')(ctx.user)
        primus.expectActionCount('start', 1, count.next)
        ctx.user.copyInstance(
          ctx.instance.attrs.shortHash, {owner: {github: ctx.orgId}}, expects.success(201, expected, count.next))
      })
      describe('Same org, different user', function () {
        beforeEach(function (done) {
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
          ctx.nonOwner = multi.createUser(done)
        })
        beforeEach(function (done) {
          var count = createCount(2, done)
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
          require('../../fixtures/mocks/github/user')(ctx.nonOwner)
          primus.expectActionCount('start', 1, count.next)
          ctx.otherInstance = ctx.user.copyInstance(ctx.instance.attrs.shortHash, count.next)
        })
        it('should copy the instance when part of the same org as the owner', function (done) {
          var count = createCount(2, done)
          var expected = {
            shortHash: exists,
            name: exists,
            public: exists,
            createdBy: { github: ctx.nonOwner.json().accounts.github.id,
              username: ctx.nonOwner.json().accounts.github.username,
            gravatar: ctx.nonOwner.json().accounts.github.avatar_url },
            'owner.github': ctx.orgId,
            parent: ctx.otherInstance.id(),
            'build._id': ctx.build.id(),
            containers: exists
          }
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
          primus.expectActionCount('start', 1, count.next)
          ctx.nonOwner.copyInstance(ctx.otherInstance.id(), expects.success(201, expected, count.next))
        })
      })
    })
    describe('non-owner', function () {
      beforeEach(function (done) {
        require('../../fixtures/mocks/github/user-orgs')(100, 'otherOrg')
        ctx.nonOwner = multi.createUser(done)
      })
      it('should not copy a private instance', function (done) {
        var instance = ctx.nonOwner.newInstance(ctx.instance.attrs.shortHash)
        instance.copy(expects.errorStatus(403, done))
      })
      describe('public instance', function () {
        beforeEach(function (done) {
          ctx.instance.update({ json: { public: true } }, done)
        })
        it('should copy a public instance', function (done) {
          var expected = {
            shortHash: exists,
            name: exists,
            public: exists,
            createdBy: { github: ctx.user.json().accounts.github.id,
              username: ctx.user.json().accounts.github.username,
            gravatar: ctx.user.json().accounts.github.avatar_url },
            owner: { github: ctx.user.json().accounts.github.id,
              username: ctx.user.json().accounts.github.username,
            gravatar: ctx.user.json().accounts.github.avatar_url },
            parent: ctx.instance.attrs.shortHash,
            'build._id': ctx.build.id(),
            containers: exists
          }
          require('../../fixtures/mocks/github/user')(ctx.user)
          var count = createCount(2, done)
          primus.expectActionCount('start', 1, count.next)
          ctx.instance.copy(expects.success(201, expected, count.next))
        })
      })
    })
  })
})
