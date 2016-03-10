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

var request = require('request')
var randStr = require('randomstring').generate

var ctx = {}
describe('GET /auth/whitelist/', function () {
  before(api.start.bind(ctx))
  after(api.stop.bind(ctx))

  beforeEach(function (done) {
    ctx.j = request.jar()
    require('../../fixtures/multi-factory').createUser({
      requestDefaults: { jar: ctx.j }
    }, function (err, user) {
      ctx.user = user
      done(err)
    })
  })
  beforeEach(function (done) {
    require('../../fixtures/mocks/github/user-orgs')(2828361, 'Runnable')
    ctx.name = randStr(5)
    var getOpts = function (name) {
      return {
        method: 'POST',
        url: process.env.FULL_API_DOMAIN + '/auth/whitelist',
        json: true,
        body: { name: name },
        jar: ctx.j
      }
    }
    request(getOpts(ctx.name), function (err, res) {
      if (err) done(err)
      request(getOpts('Runnable'), function (err, res) {
        if (err) done(err)
        done()
      })
    })
  })
  afterEach(require('../../fixtures/clean-mongo').removeEverything)

  it('should return an array of all the whitelisted orgs', function (done) {
    require('../../fixtures/mocks/github/user-orgs')(2828361, 'Runnable')
    var opts = {
      method: 'GET',
      url: process.env.FULL_API_DOMAIN + '/auth/whitelist/',
      json: true,
      jar: ctx.j
    }
    request(opts, function (err, res, body) {
      expect(err).to.be.null()
      expect(res).to.exist()
      expect(res.statusCode).to.equal(200)
      require('../../fixtures/check-whitelist')([ctx.name, 'Runnable'], done)
    })
  })
})
