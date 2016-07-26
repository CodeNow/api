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
var MongoWhitelist = require('models/mongo/user-whitelist')

var request = require('request')
var randStr = require('randomstring').generate

var ctx = {}
describe('GET /auth/whitelist/:name', function () {
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
    ctx.name = randStr(5)
    MongoWhitelist.create({
      name: ctx.name,
      lowerName: ctx.name.toLowerCase(),
      githubId: 2828361,
      allowed: true
    }, done)
  })
  afterEach(require('../../fixtures/clean-mongo').removeEverything)

  it('should return 204 is a name is in the whitelist', function (done) {
    require('../../fixtures/mocks/github/user-orgs')(2828361, 'Runnable')
    var opts = {
      method: 'GET',
      url: process.env.FULL_API_DOMAIN + '/auth/whitelist/' + ctx.name,
      json: true,
      jar: ctx.j
    }
    request(opts, function (err, res, body) {
      expect(err).to.be.null()
      expect(res).to.exist()
      expect(res.statusCode).to.equal(204)
      expect(body).to.be.undefined()
      require('../../fixtures/check-whitelist')([ctx.name], done)
    })
  })
})
