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
var nock = require('nock')

const whitelistOrgs = require('../../fixtures/mocks/big-poppa').whitelistOrgs
const whitelistUserOrgs = require('../../fixtures/mocks/big-poppa').whitelistUserOrgs
var ctx = {}
describe('GET /auth/whitelist/:name', function () {
  before(api.start.bind(ctx))
  after(api.stop.bind(ctx))

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
    whitelistOrgs([runnableOrg, otherOrg])
    done()
  })

  beforeEach(function (done) {
    ctx.j = request.jar()
    require('../../fixtures/multi-factory').createUser({
      requestDefaults: { jar: ctx.j }
    }, function (err, user) {
      ctx.user = user
      whitelistUserOrgs(ctx.user, [runnableOrg])
      done(err)
    })
  })
  beforeEach(function (done) {
    nock('http://' + process.env.BIG_POPPA_HOST)
      .get('/organization/?lowerName=' + otherOrg.name.toLowerCase())
      .reply(
        404, {
          err: 'asdasdasd'
        }
      )
    done()
  })
  afterEach(require('../../fixtures/clean-mongo').removeEverything)
  afterEach(require('../../fixtures/clean-nock'))

  it('should return 404 is a name is NOT in the whitelist', function (done) {
    require('../../fixtures/mocks/github/user-orgs')(2828361, 'Runnable')
    var opts = {
      method: 'GET',
      url: process.env.FULL_API_DOMAIN + '/auth/whitelist/' + ctx.name,
      json: true,
      jar: ctx.j
    }
    request(opts, function (err, res) {
      expect(err).to.be.null()
      expect(res).to.exist()
      expect(res.statusCode).to.equal(404)
      done()
    })
  })
})
