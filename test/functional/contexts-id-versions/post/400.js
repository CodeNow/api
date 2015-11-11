'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach

var api = require('../../fixtures/api-control')
var dock = require('../../fixtures/dock')
var multi = require('../../fixtures/multi-factory')
var primus = require('../../fixtures/primus')

var typesTests = require('../../fixtures/types-test-util')

describe('400 POST /contexts/:contextid/versions', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  before(dock.start.bind(ctx))
  before(require('../../fixtures/mocks/api-client').setup)
  beforeEach(primus.connect)
  afterEach(primus.disconnect)
  after(api.stop.bind(ctx))
  after(dock.stop.bind(ctx))
  after(require('../../fixtures/mocks/api-client').clean)

  describe('invalid types', function () {
    beforeEach(function (done) {
      multi.createBuild(function (err, build, context, user) {
        ctx.build = build
        ctx.context = context
        ctx.user = user
        done(err)
      })
    })

    beforeEach(function (done) {
      multi.createBuiltBuild(function (err, build, user, modelArr) {
        if (err) { return done(err) }
        ctx.build = build
        ctx.user = user
        ctx.context = modelArr[1]
        ctx.infraCodeVersionId = modelArr[0].json().infraCodeVersion
        done()
      })
    })

    var def = {
      action: 'create versions',
      optionalParams: [
        {
          name: 'infraCodeVersion',
          type: 'ObjectId'
        }
      ]
    }

    typesTests.makeTestFromDef(def, ctx, lab, function (body, cb) {
      ctx.context.createVersion(body, cb)
    })
  })
})
