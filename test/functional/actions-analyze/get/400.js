'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach

var api = require('../../fixtures/api-control')
var generateKey = require('../../fixtures/key-factory')
// var hooks = require('../../fixtures/analyze-hooks')
var multi = require('../../fixtures/multi-factory')

// var repoContentsMock = require('../../fixtures/mocks/github/repos-contents')

describe('Analyze - /actions/analyze', function () {
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

// tests below run in 200.js due to very strange condition where
// they fail if separated into this file
/*
describe('Error conditions', function () {
  it('should return 400 code without a "repo" query parameter', function (done) {
    ctx.request.get(
      hooks.getErrorNoQueryParam,
      function (err, res) {
        expect(res.statusCode).to.equal(400)
        expect(res.body.message).to.equal('query parameter "repo" must be a string')
        done()
    })
  })

  it('should return 400 code for repository with no recognized dependency file', function (done) {
    repoContentsMock.repoContentsDirectory('python', {})
    ctx.request.get(
      hooks.getSuccess,
      function (err, res) {
        console.log(res.body)
        expect(res.statusCode).to.equal(400)
        expect(res.body.message).to.equal('unknown language/framework type')
        done()
    })
  })
})
*/
})
