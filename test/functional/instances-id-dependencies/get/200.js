'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach

var expect = require('code').expect
var api = require('../../fixtures/api-control')
var dock = require('../../fixtures/dock')
var mockGetUserById = require('../../fixtures/mocks/github/getByUserId')
var multi = require('../../fixtures/multi-factory')
var expects = require('../../fixtures/expects')
var createCount = require('callback-count')
var primus = require('../../fixtures/primus')

describe('Dependencies - /instances/:id/dependencies', function () {
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
  beforeEach(
    mockGetUserById.stubBefore(function () {
      return []
    })
  )
  afterEach(mockGetUserById.stubAfter)
  describe('User Instances', function () {
    beforeEach(function (done) {
      multi.createAndTailInstance(primus, function (err, instance, build, user) {
        // [contextVersion, context, build, user], [srcContextVersion, srcContext, moderator]
        if (err) { return done(err) }
        ctx.instance = instance
        ctx.build = build
        ctx.user = user
        done()
      })
    })

    it('should be owned by an org', function (done) {
      ctx.instance.fetchDependencies(expects.success(200, [], done))
    })

    describe('Instance has a env dependency', { timeout: 1000 }, function () {
      beforeEach(function (done) {
        var count = createCount(2, done)
        ctx.elasticHostname = ctx.instance.getElasticHostname()
        var body = {
          env: [
            'other=' + ctx.elasticHostname
          ],
          name: 'name',
          build: ctx.build.id()
        }

        primus.expectAction('start', count.next)
        ctx.instanceWithDep = ctx.user.createInstance(body, count.next)
      })

      it('should return a dependency', function (done) {
        ctx.instanceWithDep.fetchDependencies(function (err, data) {
          expect(err).to.not.exist()
          expect(data).to.be.an.array()
          expect(data).to.have.a.length(1)
          expect(data[0]).to.contain({
            id: ctx.instance.attrs._id.toString(),
            shortHash: ctx.instance.attrs.shortHash.toString(),
            lowerName: ctx.instance.attrs.lowerName,
            name: ctx.instance.attrs.name,
            hostname: ctx.elasticHostname.toLowerCase(),
            owner: { github: ctx.instance.attrs.owner.github },
            contextVersion: { context: ctx.instance.attrs.contextVersion.context.toString() }
          })
          done()
        })
      })
    })
  })
})
