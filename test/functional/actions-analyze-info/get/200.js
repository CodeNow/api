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
var generateKey = require('../../fixtures/key-factory')
var hooks = require('../../fixtures/analyze-info-hooks')
var multi = require('../../fixtures/multi-factory')

describe('Analyze - /actions/analyze/info', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  after(api.stop.bind(ctx))
  before(require('../../fixtures/mocks/api-client').setup)
  after(require('../../fixtures/mocks/api-client').clean)
  beforeEach(generateKey)
  beforeEach(function (done) {
    multi.createUser(function (err, user) {
      if (err) { return done(err) }
      ctx.user = user
      ctx.request = user.client.request
      done()
    })
  })
  afterEach(require('../../fixtures/clean-ctx')(ctx))

  it('returns formatted language support information', function (done) {
    ctx.request.get(
      hooks.getSuccess,
      function (err, res) {
        if (err) { return done(err) }
        expect(res.statusCode).to.equal(200)
        expect(res.body).to.be.an.object()
        done()
      }
    )
  })
})
