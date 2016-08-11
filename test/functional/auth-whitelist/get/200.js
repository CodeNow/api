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
describe('GET /auth/whitelist/', function () {
  before(api.start.bind(ctx))
  after(api.stop.bind(ctx))

  before(cb => bigPoppaMock.start(cb))
  after(cb => bigPoppaMock.stop(cb))
  afterEach(require('../../fixtures/clean-nock'))

  var whitelistOrgs = function (user, orgNames) {
    bigPoppaMock.stub('GET', `/user/?githubId=${user.attrs.accounts.github.id}`).returns({
      status: 200,
      body: JSON.stringify([{
        organizations: orgNames.map(function (orgName, index) {
          return {
            name: orgName,
            id: index + 1
          }
        }),
        githubId: 2828361,
        allowed: true
      }])
    })
  }

  beforeEach(function (done) {
    ctx.j = request.jar()
    require('../../fixtures/multi-factory').createUser({
      requestDefaults: { jar: ctx.j }
    }, function (err, user) {
      ctx.user = user
      done(err)
    })
  })

  afterEach(require('../../fixtures/clean-mongo').removeEverything)

  describe('User with whitelisted orgs', function () {
    beforeEach(function (done) {
      require('../../fixtures/mocks/github/user-orgs')(2828361, 'Runnable')
      ctx.name = randStr(5)
      whitelistOrgs(ctx.user, [ctx.name, 'Runnable'])
      done()
    })

    it('should return an array of all the whitelisted orgs', function (done) {
      var opts = {
        method: 'GET',
        url: process.env.FULL_API_DOMAIN + '/auth/whitelist/',
        json: true,
        jar: ctx.j
      }
      request(opts, function (err, res, body) {
        expect(err).to.be.null()
        expect(res).to.exist()
        expect(body).to.be.an.array()
        expect(body.length).to.equal(2)
        expect(res.statusCode).to.equal(200)
        done()
      })
    })
  })

  describe('User with no whitelisted orgs', function () {
    beforeEach(function (done) {
      ctx.name = randStr(5)
      done()
    })

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
        expect(body).to.be.an.array()
        expect(body.length).to.equal(0)
        done()
      })
    })
  })

  describe('Non-Runnable user', function () {
    beforeEach(function (done) {
      ctx.name = randStr(5)
      whitelistOrgs(ctx.user, [ctx.name])
      done()
    })

    it('should return an array of all the whitelisted orgs', function (done) {
      require('../../fixtures/mocks/github/user-orgs')(123, 'Wow')
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
        expect(body).to.be.an.array()
        expect(body.length).to.equal(1)
        done()
      })
    })
  })
})
