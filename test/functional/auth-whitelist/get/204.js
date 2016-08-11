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

const MockAPI = require('mehpi')
const bigPoppaMock = new MockAPI(process.env.BIG_POPPA_PORT)

var ctx = {}
describe('GET /auth/whitelist/:name', function () {
  before(api.start.bind(ctx))
  after(api.stop.bind(ctx))

  before(cb => bigPoppaMock.start(cb))
  after(cb => bigPoppaMock.stop(cb))

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
    ctx.name = randStr(5).toLowerCase()
    bigPoppaMock.stub('GET', `/organization/?lowerName=${ctx.name.toLowerCase()}`).returns({
      status: 200,
      body: JSON.stringify([{
        name: 'Runnable',
        githubId: 1,
        allowed: true
      }])
    })
    done()
  })
  afterEach(require('../../fixtures/clean-mongo').removeEverything)
  afterEach(require('../../fixtures/clean-nock'))

  it('should return 204 if a name is in the whitelist', function (done) {
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
      done()
    })
  })
})
