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
var Code = require('code')
var expect = Code.expect

var api = require('./fixtures/api-control')
var dock = require('./fixtures/dock')
var mockGetUserById = require('./fixtures/mocks/github/getByUserId')
var multi = require('./fixtures/multi-factory')
// var expects = require('./fixtures/expects')
var async = require('async')
var primus = require('./fixtures/primus')
var createCount = require('callback-count')
var rabbitMQ = require('models/rabbitmq')

describe('BDD - Instance Dependencies', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  before(dock.start.bind(ctx))
  before(require('./fixtures/mocks/api-client').setup)
  before(primus.connect)
  after(primus.disconnect)
  after(api.stop.bind(ctx))
  after(dock.stop.bind(ctx))
  after(require('./fixtures/mocks/api-client').clean)
  afterEach(require('./fixtures/clean-mongo').removeEverything)
  afterEach(require('./fixtures/clean-ctx')(ctx))
  afterEach(require('./fixtures/clean-nock'))
  beforeEach(
    mockGetUserById.stubBefore(function () {
      return []
    })
  )
  afterEach(mockGetUserById.stubAfter)

  beforeEach(function (done) {
    multi.createAndTailInstance(primus, { name: 'web-instance' }, function (err, instance, build, user) {
      if (err) { return done(err) }
      ctx.webInstance = instance
      ctx.user = user
      ctx.build = build
      // boy this is a bummer... let's cheat a little bit
      require('./fixtures/mocks/github/user')(ctx.user)
      require('./fixtures/mocks/github/user')(ctx.user)
      require('./fixtures/mocks/github/user')(ctx.user)
      var count = createCount(2, done)
      primus.expectAction('start', {}, function () {
        count.next()
      })
      ctx.apiInstance = ctx.user.createInstance({
        name: 'api-instance',
        build: ctx.build.id(),
        masterPod: true
      }, count.next)
    })
  })

  it('should have no dependencies to start', function (done) {
    ctx.webInstance.fetchDependencies(function (err, deps) {
      expect(err).to.be.null()
      expect(deps).to.be.an.array()
      expect(deps).to.have.length(0)
      done()
    })
  })

  describe('from none to 1 -> 1 relations', function () {
    describe('as master pod environment relations with ports', function () {
      beforeEach(function (done) {
        var envs = ctx.webInstance.attrs.env || []
        envs.push('API=' + ctx.apiInstance.attrs.lowerName + '-staging-' +
          ctx.user.attrs.accounts.github.username + '.' + process.env.USER_CONTENT_DOMAIN + ':909')
        ctx.webInstance.update({ env: envs }, done)
      })

      it('should catch dependencies via environment variables', function (done) {
        ctx.webInstance.fetchDependencies(function (err, deps) {
          if (err) { return done(err) }
          expect(deps).to.have.length(1)
          expect(deps[0]).to.deep.contain({
            lowerName: 'api-instance',
            id: ctx.apiInstance.attrs._id.toString()
          })
          done()
        })
      })
    })

    describe('as master pod environment relations', function () {
      beforeEach(function (done) {
        var envs = ctx.webInstance.attrs.env || []
        envs.push('API=' + ctx.apiInstance.attrs.lowerName + '-staging-' +
          ctx.user.attrs.accounts.github.username + '.' + process.env.USER_CONTENT_DOMAIN)
        envs.push('PI=does-not-exist-staging-' +
          ctx.user.attrs.accounts.github.username + '.' + process.env.USER_CONTENT_DOMAIN)
        ctx.webInstance.update({ env: envs }, done)
      })

      it('should catch dependencies via environment variables', function (done) {
        ctx.webInstance.fetchDependencies(function (err, deps) {
          if (err) { return done(err) }
          expect(deps).to.have.length(1)
          expect(deps[0]).to.deep.contain({
            lowerName: 'api-instance',
            id: ctx.apiInstance.attrs._id.toString()
          })
          done()
        })
      })

      it('should remove dependencies via environment variables', function (done) {
        async.series([
          ctx.webInstance.update.bind(ctx.webInstance, { env: [] }),
          ctx.webInstance.fetchDependencies.bind(ctx.webInstance)
        ], function (err, results) {
          if (err) { return done(err) }
          var deps = results[1][0]
          expect(deps).to.have.length(0)
          done()
        })
      })

      it('should remove dependencies that are deleted', function (done) {
        require('./fixtures/mocks/github/user-id')(ctx.user.attrs.accounts.github.id,
          ctx.user.attrs.accounts.github.login)
        sinon.stub(rabbitMQ, 'deleteInstance', function () {})
        ctx.apiInstance.destroy(function (err) {
          if (err) { return done(err) }
          expect(rabbitMQ.deleteInstance.callCount).to.equal(1)
          rabbitMQ.deleteInstance.restore()
          done()
        })
      })
    })
  })

  describe('from 1 -> 1', function () {
    beforeEach(function (done) {
      // define web as dependent on api
      var envs = ctx.webInstance.attrs.env || []
      envs.push('API=' + ctx.apiInstance.attrs.lowerName + '-staging-' +
        ctx.user.attrs.accounts.github.username + '.' + process.env.USER_CONTENT_DOMAIN)
      ctx.webInstance.update({ env: envs }, done)
    })

    describe('deleting the top level instance', function () {
      it('should delete succesfully', function (done) {
        // it deletes all nodes - a sanity test to make sure that that works
        require('./fixtures/mocks/github/user-id')(ctx.user.attrs.accounts.github.id,
          ctx.user.attrs.accounts.github.login)
        sinon.stub(rabbitMQ, 'deleteInstance', function () {})
        ctx.webInstance.destroy(function (err) {
          if (err) { return done(err) }
          expect(rabbitMQ.deleteInstance.callCount).to.equal(1)
          rabbitMQ.deleteInstance.restore()
          done()
        })
      })
    })

    describe('to 1 -> 0 relations', function () {
      it('should remove deps when envs updated', function (done) {
        // define web as dependent on api
        ctx.webInstance.update({ env: [] }, function (err) {
          if (err) { return done(err) }
          ctx.webInstance.fetchDependencies(function (err, deps) {
            expect(err).to.be.null()
            expect(deps).to.be.an.array()
            expect(deps).to.have.length(0)
            done()
          })
        })
      })
    })

    describe('from a -> b to a -> b -> a (circular) relations', function () {
      beforeEach(function (done) {
        var envs = ctx.apiInstance.attrs.env || []
        envs.push('API=' + ctx.webInstance.attrs.lowerName + '-staging-' +
          ctx.user.attrs.accounts.github.username + '.' + process.env.USER_CONTENT_DOMAIN)
        ctx.apiInstance.update({ env: envs }, done)
      })

      it('should update the deps of an instance', function (done) {
        var webDeps = [{
          id: ctx.apiInstance.attrs._id.toString(),
          shortHash: ctx.apiInstance.attrs.shortHash.toString(),
          hostname: [
            'api-instance-staging-',
            ctx.user.attrs.accounts.github.username.toLowerCase(),
            '.' + process.env.USER_CONTENT_DOMAIN
          ].join(''),
          lowerName: ctx.apiInstance.attrs.lowerName,
          name: ctx.apiInstance.attrs.name,
          owner: { github: ctx.apiInstance.attrs.owner.github },
          contextVersion: { context: ctx.apiInstance.attrs.contextVersion.context }
        }]
        var apiDeps = [{
          id: ctx.webInstance.attrs._id.toString(),
          shortHash: ctx.webInstance.attrs.shortHash.toString(),
          hostname: [
            'web-instance-staging-',
            ctx.user.attrs.accounts.github.username.toLowerCase(),
            '.' + process.env.USER_CONTENT_DOMAIN
          ].join(''),
          lowerName: ctx.webInstance.attrs.lowerName,
          name: ctx.webInstance.attrs.name,
          owner: { github: ctx.webInstance.attrs.owner.github },
          contextVersion: { context: ctx.webInstance.attrs.contextVersion.context }
        }]
        ctx.webInstance.fetchDependencies(function (err, deps) {
          expect(err).to.be.null()
          expect(deps).to.have.length(1)
          expect(deps[0]).to.deep.contain(webDeps[0])
          ctx.apiInstance.fetchDependencies(function (err, deps) {
            expect(err).to.be.null()
            expect(deps).to.have.length(1)
            expect(deps[0]).to.deep.contain(apiDeps[0])
            done()
          })
        })
      })
    })
  })
})