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
var multi = require('../../fixtures/multi-factory')
var expects = require('../../fixtures/expects')
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

    describe('Instance has a env dependency', function () {
      beforeEach(function (done) {
        ctx.elasticHostname = ctx.instance.getElasticHostname()
        var body = {
          env: [
            'other=' + ctx.elasticHostname
          ],
          build: ctx.build.id()
        }

        primus.expectAction('start', done)
        ctx.instanceWithDep = ctx.user.createInstance(body, function () {})
      })

      it('should return a dependency', function (done) {
        ctx.instanceWithDep.fetchDependencies(function (err, data) {
          expect(err).to.not.exist()
          expect(data).to.be.an.array()
          expect(data).to.have.a.length(1)
          expect(data[0]).to.deep.contain({
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
