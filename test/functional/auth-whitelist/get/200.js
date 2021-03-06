'use strict'

const Promise = require('bluebird')
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
var nock = require('nock')
const whitelistOrgs = require('../../fixtures/mocks/big-poppa').whitelistOrgs
const whitelistUserOrgs = require('../../fixtures/mocks/big-poppa').whitelistUserOrgs
const sessionUser = require('../../fixtures/mocks/big-poppa').sessionUser
const userMock = require('../../fixtures/mocks/github/user')

var ctx = {}
describe('GET /auth/whitelist/', function () {
  before(api.start.bind(ctx))
  after(api.stop.bind(ctx))

  beforeEach(require('../../fixtures/clean-nock'))
  afterEach(require('../../fixtures/clean-nock'))

  var runnableOrg = {
    name: 'Runnable',
    githubId: 2828361,
    allowed: true
  }
  var otherOrg = {
    name: 'asdasasdas',
    githubId: 123445,
    allowed: true
  }

  beforeEach(function (done) {
    ctx.j = request.jar()
    require('../../fixtures/multi-factory').createUser({
      requestDefaults: { jar: ctx.j },
      orgs: [runnableOrg, otherOrg]
    }, function (err, user) {
      ctx.user = user
      whitelistOrgs([runnableOrg, otherOrg])
      userMock(user)
      done(err)
    })
  })

  afterEach(require('../../fixtures/clean-mongo').removeEverything)

  describe('User with whitelisted orgs', function () {
    beforeEach(function (done) {
      require('../../fixtures/mocks/github/user-orgs')(2828361, 'Runnable')
      ctx.name = randStr(5)
      Promise.all([
        whitelistUserOrgs(ctx.user, [runnableOrg]),
        sessionUser([runnableOrg])
      ])
      .asCallback(done)
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
        expect(body.length).to.equal(1)
        expect(res.statusCode).to.equal(200)
        done()
      })
    })
  })

  describe('User with no whitelisted orgs', function () {
    beforeEach(function (done) {
      ctx.name = randStr(5)
      nock.cleanAll()
      userMock(ctx.user)
      Promise.all([
        whitelistUserOrgs(ctx.user, []),
        sessionUser([])
      ])
      .asCallback(done)
    })

    it('should return an array with no orgs', function (done) {
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
      nock.cleanAll()
      userMock(ctx.user)
      Promise.all([
        whitelistUserOrgs(ctx.user, [otherOrg]),
        sessionUser([otherOrg])
      ])
      .asCallback(done)
    })

    it('should return an array of all the whitelisted orgs', function (done) {
      require('../../fixtures/mocks/github/user-orgs')(otherOrg.githubId, otherOrg.name)
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
