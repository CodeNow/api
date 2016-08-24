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
const whitelistOrgs = require('../fixtures/mocks/big-poppa').whitelistOrgs
const whitelistUserOrgs = require('../fixtures/mocks/big-poppa').whitelistUserOrgs

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

  var otherOrg = {
    name: 'otherOrg',
    githubId: 2222,
    allowed: true
  }
  beforeEach(function (done) {
    whitelistOrgs([otherOrg])
    done()
  })

  describe('user in an org in the whitelist', function () {
    var tokenUrl = baseUrl + 'token'
    before(function (done) {
      ctx.username = randStr(5)
      ctx.testToken = uuid()
      var user = {}
      keypather.set(user, 'attrs.accounts.github.id', 1000)
      whitelistUserOrgs(user, [otherOrg])
      done()
    })

    it('should let the user authenticate', function (done) {
      require('../fixtures/mocks/github/user')(1000, ctx.username, ctx.testToken)
      require('../fixtures/mocks/github/user-orgs')(otherOrg.githubId, otherOrg.name)
      request.post({
        url: tokenUrl,
        json: true,
        body: { accessToken: ctx.testToken },
        qs: { username: otherOrg.name },
        followRedirect: false
      }, function (err, res) {
        if (err) { return done(err) }
        expect(res.statusCode).to.equal(200)
        done()
      })
    })
  })
})
