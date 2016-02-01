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

var createCount = require('callback-count')
var pluck = require('101/pluck')

var api = require('./fixtures/api-control')
var dock = require('./fixtures/dock')
var multi = require('./fixtures/multi-factory')
var mockGetUserById = require('./fixtures/mocks/github/getByUserId')
var primus = require('./fixtures/primus')

describe('BDD - Isolation', function () {
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
  beforeEach(mockGetUserById.stubBefore(function () { return [] }))
  afterEach(mockGetUserById.stubAfter)
  beforeEach(function (done) {
    multi.createAndTailInstance(
      primus,
      { name: 'web-instance' },
      function (err, instance, build, user) {
        if (err) { return done(err) }
        ctx.webInstance = instance
        ctx.user = user
        ctx.build = build
        // boy this is a bummer... let's cheat a little bit
        require('./fixtures/mocks/github/user')(ctx.user)
        require('./fixtures/mocks/github/user')(ctx.user)
        require('./fixtures/mocks/github/user')(ctx.user)
        ctx.apiInstance = ctx.user.createInstance({
          name: 'api-instance',
          build: ctx.build.id(),
          masterPod: true
        }, function (err) {
          if (err) { return done(err) }
          primus.expectAction('start', {}, function () {
            ctx.apiInstance.fetch(done)
          })
        })
      })
  })

  it('should let us make an isolation', function (done) {
    var opts = {
      master: ctx.webInstance.attrs._id.toString(),
      children: []
    }
    ctx.user.createIsolation(opts, function (err, isolation) {
      if (err) { return done(err) }
      expect(isolation).to.exist()
      expect(isolation.owner.github).to.equal(ctx.webInstance.attrs.owner.github)
      expect(isolation.createdBy.github).to.equal(ctx.webInstance.attrs.createdBy.github)
      done()
    })
  })

  describe('with children', function () {
    it('should let us make an isolation', function (done) {
      var opts = {
        master: ctx.webInstance.attrs._id.toString(),
        children: [
          { instance: ctx.apiInstance.attrs._id.toString() }
        ]
      }
      ctx.user.createIsolation(opts, function (err, isolation) {
        if (err) { return done(err) }
        expect(isolation).to.exist()
        done()
      })
    })

    describe('once it is created', function (done) {
      beforeEach(function (done) {
        var opts = {
          master: ctx.webInstance.attrs._id.toString(),
          children: [
            { instance: ctx.apiInstance.attrs._id.toString() }
          ]
        }
        ctx.isolation = ctx.user.createIsolation(opts, done)
      })

      it('should list the isolated instance when asked for by name', function (done) {
        var childName = [
          ctx.webInstance.attrs.shortHash,
          ctx.apiInstance.attrs.lowerName
        ].join('--')
        var opts = {
          owner: { github: ctx.user.attrs.accounts.github.id },
          name: childName
        }
        ctx.user.fetchInstances(opts, function (err, instances) {
          if (err) { return done(err) }
          expect(instances).to.have.length(1)
          expect(instances[0].lowerName).to.equal(childName)
          done()
        })
      })

      it('should list instances with the isolation', function (done) {
        var opts = {
          owner: { github: ctx.user.attrs.accounts.github.id },
          isolated: ctx.isolation.attrs._id.toString()
        }
        ctx.user.fetchInstances(opts, function (err, instances) {
          if (err) { return done(err) }
          expect(instances).to.have.length(2)
          var instanceNames = instances.map(pluck('lowerName'))
          expect(instanceNames).to.contain(
            ctx.webInstance.attrs.shortHash +
            '--' +
            ctx.apiInstance.attrs.lowerName
          )
          expect(instanceNames).to.contain(
            ctx.webInstance.attrs.lowerName
          )
          done()
        })
      })
    })
  })

  it('should message through primus the update', function (done) {
    var socketIsolationId
    var createdIsolationId
    // final callback
    var count = createCount(2, function (err) {
      if (err) { return done(err) }
      expect(createdIsolationId).to.equal(socketIsolationId)
      done()
    })
    // should get a primus action
    primus.expectAction('isolation', function (err, data) {
      if (err) { return count.next(err) }
      // try because having multiple throws can be bad
      try {
        expect(data.data.data.isIsolationGroupMaster).to.be.true()
        expect(data.data.data.isolated).to.exist()
      } catch (expectErr) {
        err = expectErr
      }
      socketIsolationId = data.data.data.isolated
      count.next(err)
    })
    var opts = {
      master: ctx.webInstance.attrs._id.toString(),
      children: []
    }
    // should create the isolation correctly
    ctx.user.createIsolation(opts, function (err, newIsolation) {
      if (err) { count.next(err) }
      createdIsolationId = newIsolation._id
      count.next()
    })
  })

  describe('when an instance is isolated', function () {
    beforeEach(function (done) {
      var opts = {
        master: ctx.webInstance.attrs._id.toString(),
        children: []
      }
      ctx.isolation = ctx.user.createIsolation(opts, done)
    })

    it('should be reflected in the instance', function (done) {
      ctx.webInstance.fetch(function (err, data) {
        if (err) { return done(err) }
        expect(data._id).to.equal(ctx.webInstance.attrs._id.toString())
        expect(data.isolated).to.equal(ctx.isolation.attrs._id.toString())
        expect(data.isIsolationGroupMaster).to.be.true()
        done()
      })
    })

    it('should be able to be deisolated', function (done) {
      ctx.isolation.destroy(done)
    })

    describe('when it is destroyed', function () {
      beforeEach(function (done) {
        ctx.isolation.destroy(done)
      })

      it('should unset the fields on the instance', function (done) {
        ctx.webInstance.fetch(function (err, data) {
          if (err) { return done(err) }
          expect(data.isolated).to.be.undefined()
          expect(data.isIsolationGroupMaster).to.be.undefined()
          done()
        })
      })
    })
  })

  describe('route issues when isolating', function () {
    it('should 404 when instance not found', function (done) {
      var opts = {
        master: 'deadbeefdeadbeefdeadbeef',
        children: []
      }
      ctx.user.createIsolation(opts, function (err, isolation) {
        expect(err).to.exist()
        expect(err.message).to.match(/instance not found/i)
        expect(err.output.statusCode).to.equal(404)
        done()
      })
    })

    describe('with other instances', function () {
      beforeEach(function (done) {
        multi.createAndTailInstance(
          primus,
          { name: 'web-instance' },
          function (err, instance, build, user) {
            ctx.otherInstance = instance
            done(err)
          })
      })

      it('should send permissions issue', function (done) {
        var opts = {
          master: ctx.otherInstance.attrs._id.toString(),
          children: []
        }
        ctx.user.createIsolation(opts, function (err, isolation) {
          expect(err).to.exist()
          expect(err.message).to.match(/access denied/i)
          expect(err.output.statusCode).to.equal(403)
          done()
        })
      })
    })
  })
})
