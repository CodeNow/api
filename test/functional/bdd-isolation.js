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

var api = require('./fixtures/api-control')
var dock = require('./fixtures/dock')
var multi = require('./fixtures/multi-factory')
var mockGetUserById = require('./fixtures/mocks/github/getByUserId')
var primus = require('./fixtures/primus')
var createCount = require('callback-count')

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
        var count = createCount(2, done)
        primus.expectAction('start', {}, count.next)
        ctx.instance = ctx.user.createInstance({
          name: 'api-instance',
          build: ctx.build.id(),
          masterPod: true
        }, count.next)
      })
  })

  it('should let us make a debug container', function (done) {
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

  describe('when an instance is isolated', function () {
    beforeEach(function (done) {
      var opts = {
        master: ctx.webInstance.attrs._id.toString(),
        children: []
      }
      ctx.user.createIsolation(opts, function (err, isolation) {
        ctx.isolation = isolation
        done(err)
      })
    })

    it('should be reflected in the instance', function (done) {
      ctx.webInstance.fetch(function (err, data) {
        if (err) { return done(err) }
        expect(data._id).to.equal(ctx.webInstance.attrs._id.toString())
        expect(data.isolated).to.equal(ctx.isolation._id.toString())
        expect(data.isIsolationGroupMaster).to.be.true()
        done()
      })
    })
  })
})
