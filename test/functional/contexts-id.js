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
var multi = require('./fixtures/multi-factory')
var expects = require('./fixtures/expects')
var randStr = require('randomstring').generate

describe('Context - /contexts/:id', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  beforeEach(require('./fixtures/mocks/github/login'))
  beforeEach(require('./fixtures/mocks/github/login'))
  after(api.stop.bind(ctx))
  afterEach(require('./fixtures/clean-mongo').removeEverything)
  afterEach(require('./fixtures/clean-ctx')(ctx))
  afterEach(require('./fixtures/clean-nock'))

  beforeEach(function (done) {
    multi.createContext(function (err, context, user) {
      ctx.context = context
      ctx.user = user
      done(err)
    })
  })
  describe('GET', function () {
    describe('permissions', function () {
      describe('public', function () {
        beforeEach(function (done) {
          ctx.context.update({ json: { public: true } }, done)
        })
        describe('owner', function () {
          it('should get the context', function (done) {
            ctx.context.fetch(expects.success(200, ctx.context.json(), done))
          })
        })
        describe('non-owner', function () {
          beforeEach(function (done) {
            ctx.nonOwner = multi.createUser(done)
          })
          it('should get the context', function (done) {
            ctx.nonOwner.fetchContext(ctx.context.id(), expects.success(200, ctx.context.json(), done))
          })
        })
        describe('moderator', function () {
          beforeEach(function (done) {
            ctx.moderator = multi.createModerator(done)
          })
          it('should get the context', function (done) {
            ctx.moderator.fetchContext(ctx.context.id(), expects.success(200, ctx.context.json(), done))
          })
        })
      })
      describe('private', function () {
        beforeEach(function (done) {
          ctx.context.update({ json: { public: false } }, done)
        })
        describe('owner', function () {
          it('should get the context', function (done) {
            ctx.context.fetch(expects.success(200, ctx.context.json(), done))
          })
        })
        describe('non-owner', function () {
          beforeEach(function (done) {
            require('./fixtures/mocks/github/user-orgs')(999, 'other')
            ctx.nonOwner = multi.createUser(done)
          })
          it('should not get the context (403 forbidden)', function (done) {
            ctx.nonOwner.fetchContext(ctx.context.id(), expects.errorStatus(403, done))
          })
        })
        describe('moderator', function () {
          beforeEach(function (done) {
            ctx.moderator = multi.createModerator(done)
          })
          it('should get the context', function (done) {
            ctx.moderator.fetchContext(ctx.context.id(), expects.success(200, ctx.context.json(), done))
          })
        })
      })
    })

    describe('not founds', function () {
      beforeEach(function (done) {
        ctx.context.destroy(done)
      })
      it('should not get the context if missing (404 context)', function (done) {
        ctx.user.fetchContext(ctx.context.id(), expects.errorStatus(404, done))
      })
    })
  })

  describe('PATCH', function () {
    var updates = [{
      name: randStr(5)
    }, {
      public: true
    }, {
      public: false
    }]

    describe('permissions', function () {
      describe('owner', function () {
        updates.forEach(function (json) {
          var keys = Object.keys(json)
          var vals = keys.map(function (key) { return json[key] })
          it("should update context's " + keys + ' to ' + vals, function (done) {
            ctx.context.update({ json: json }, expects.updateSuccess(json, done))
          })
        })
      })
      describe('non-owner', function () {
        beforeEach(function (done) {
          require('./fixtures/mocks/github/user-orgs')(999, 'other')
          ctx.nonOwner = multi.createUser(done)
        })
        updates.forEach(function (json) {
          var keys = Object.keys(json)
          var vals = keys.map(function (key) { return json[key] })
          it("should not update context's " + keys + ' to ' + vals + ' (403 forbidden)', function (done) {
            ctx.nonOwner.updateContext(ctx.context.id(), { json: json }, expects.errorStatus(403, done))
          })
        })
      })
      describe('moderator', function () {
        beforeEach(function (done) {
          ctx.moderator = multi.createModerator(done)
        })
        updates.forEach(function (json) {
          var keys = Object.keys(json)
          var vals = keys.map(function (key) { return json[key] })
          it("should update context's " + keys + ' to ' + vals, function (done) {
            ctx.moderator.updateContext(ctx.context.id(), { json: json }, expects.updateSuccess(json, done))
          })
        })
      })
    })

    describe('not founds', function () {
      beforeEach(function (done) {
        ctx.context.destroy(done)
      })
      updates.forEach(function (json) {
        var keys = Object.keys(json)
        var vals = keys.map(function (key) { return json[key] })
        it("should not update context's " + keys + ' to ' + vals + ' (404 not found)', function (done) {
          ctx.user.updateContext(
            ctx.context.id(), { json: json }, expects.errorStatus(404, done))
        })
      })
    })
  })

  describe('DELETE', function () {
    describe('permissions', function () {
      describe('owner', function () {
        it('should delete the context', function (done) {
          ctx.context.destroy(expects.success(204, done))
        })
      })
      describe('non-owner', function () {
        beforeEach(function (done) {
          require('./fixtures/mocks/github/user-orgs')(999, 'other')
          ctx.nonOwner = multi.createUser(done)
        })
        it('should not delete the context (403 forbidden)', function (done) {
          ctx.nonOwner.destroyContext(ctx.context.id(), expects.errorStatus(403, done))
        })
      })
      describe('moderator', function () {
        beforeEach(function (done) {
          ctx.moderator = multi.createModerator(done)
        })
        it('should delete the context', function (done) {
          ctx.moderator.destroyContext(ctx.context.id(), expects.success(204, done))
        })
      })
    })
    describe('not founds', function () {
      beforeEach(function (done) {
        ctx.context.destroy(done)
      })
      it('should not delete the context if missing (404 context)', function (done) {
        ctx.user.destroyContext(ctx.context.id(), expects.errorStatus(404, done))
      })
    })
  })
})
