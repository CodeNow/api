'use strict'
require('loadenv')()

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var keypather = require('keypather')()
var describe = lab.describe
var expect = require('code').expect
var it = lab.it
var after = lab.after
var afterEach = lab.afterEach
var before = lab.before
var beforeEach = lab.beforeEach
var sinon = require('sinon')

var request = require('request')

var api = require('../fixtures/api-control')
var Github = require('models/apis/github')
var getUserEmails = require('../fixtures/mocks/github/get-user-emails')
var randStr = require('randomstring').generate
var uuid = require('uuid')
const MockAPI = require('mehpi')
const bigPoppaMock = new MockAPI(process.env.BIG_POPPA_PORT)

describe('/auth/github with whitelist', function () {
  var ctx = {}
  var baseUrl = 'http://' + process.env.ROOT_DOMAIN + '/auth/github/'
  before(function (done) {
    process.env.ENABLE_USER_WHITELIST = true
    done()
  })
  before(api.start.bind(ctx))
  after(api.stop.bind(ctx))
  after(function (done) {
    delete process.env.ENABLE_USER_WHITELIST
    done()
  })
  before(function (done) {
    // Stub out Github API call for `beforeEach` and `it` statements
    sinon.stub(Github.prototype, 'getUserEmails').yieldsAsync(null, getUserEmails())
    done()
  })
  after(function (done) {
    Github.prototype.getUserEmails.restore()
    done()
  })
  beforeEach(function (done) {
    Github.prototype.getUserEmails.reset()
    done()
  })
  afterEach(require('../fixtures/clean-mongo').removeEverything)
  afterEach(require('../fixtures/clean-ctx')(ctx))

  before(cb => bigPoppaMock.start(cb))
  after(cb => bigPoppaMock.stop(cb))

  function whitelistOrgsForUser (user, orgNames) {
    bigPoppaMock.stub('GET', `/user/?githubId=${user.attrs.accounts.github.id}`).returns({
      status: 200,
      body: JSON.stringify([{
        organizations: orgNames.map(orgName => { return { name: orgName } }),
        githubId: 2828361,
        allowed: true
      }])
    })
  }

  describe('user in an org in the whitelist', function () {
    var tokenUrl = baseUrl + 'token'
    before(function (done) {
      ctx.orgname = randStr(5)
      ctx.username = randStr(5)
      ctx.testToken = uuid()
      var user = {}
      keypather.set(user, 'attrs.accounts.github.id', 1000)
      whitelistOrgsForUser(user, [ctx.orgName])
      done()
    })

    it('should let the user authenticate', function (done) {
      require('../fixtures/mocks/github/user')(1000, ctx.username, ctx.testToken)
      require('../fixtures/mocks/github/user-orgs')(1001, ctx.orgname)
      request.post({
        url: tokenUrl,
        json: true,
        body: { accessToken: ctx.testToken },
        qs: { username: ctx.orgname },
        followRedirect: false
      }, function (err, res) {
        if (err) { return done(err) }
        expect(res.statusCode).to.equal(200)
        done()
      })
    })
  })
})
