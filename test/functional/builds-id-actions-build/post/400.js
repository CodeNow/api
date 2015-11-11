'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after

var api = require('./../../fixtures/api-control')
var multi = require('./../../fixtures/multi-factory')
var typesTests = require('../../fixtures/types-test-util')

describe('400 POST /builds/:id/actions/build', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  after(api.stop.bind(ctx))
  before(require('../../fixtures/mocks/api-client').setup)
  after(require('../../fixtures/mocks/api-client').clean)

  describe('invalid types', function () {
    beforeEach(function (done) {
      multi.createContextVersion(function (err, contextVersion, context, build, user) {
        ctx.contextVersion = contextVersion
        ctx.context = context
        ctx.build = build
        ctx.user = user
        done(err)
      })
    })
    var def = {
      action: 'build a build',
      optionalParams: [
        {
          name: 'message',
          type: 'string'
        }
      ]
    }

    typesTests.makeTestFromDef(def, ctx, lab, function (body, cb) {
      ctx.build.build(body, cb)
    })
  })
})
