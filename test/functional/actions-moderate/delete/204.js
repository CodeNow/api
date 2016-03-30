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
var sinon = require('sinon')

var api = require('../../fixtures/api-control')
var Github = require('models/apis/github')
var getUserEmails = require('../../fixtures/mocks/github/get-user-emails')
var multi = require('../../fixtures/multi-factory')
var request = require('request')

describe('De-Moderate - /actions/demoderate', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  after(api.stop.bind(ctx))
  before(require('../../fixtures/mocks/api-client').setup)
  after(require('../../fixtures/mocks/api-client').clean)
  afterEach(require('../../fixtures/clean-mongo').removeEverything)
  afterEach(require('../../fixtures/clean-ctx')(ctx))
  afterEach(require('../../fixtures/clean-nock'))

  before(function (done) {
    // Stub out Github API call for `beforeEach` and `it` statements
    sinon.stub(Github.prototype, 'getUserEmails', function (user, cb) {
      return cb(null, getUserEmails())
    })
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
  beforeEach(function (done) { ctx.user = multi.createUser(done) })
  beforeEach(function (done) {
    ctx.moderatorJar = request.jar()
    ctx.mod = multi.createModerator({
      requestDefaults: { jar: ctx.moderatorJar }
    }, done)
  })
  beforeEach(function (done) {
    require('../../fixtures/mocks/github/users-username')(
      ctx.user.attrs.accounts.github.id,
      ctx.user.attrs.accounts.github.username)
    require('../../fixtures/mocks/github/user')(ctx.user)
    var username = ctx.user.attrs.accounts.github.username
    var requestOpts = {
      method: 'POST',
      url: process.env.FULL_API_DOMAIN + '/actions/moderate',
      json: true,
      body: { username: username },
      jar: ctx.moderatorJar
    }
    request(requestOpts, done)
  })

  it('should return us to ourselves', function (done) {
    require('../../fixtures/mocks/github/users-username')(
      ctx.mod.attrs.accounts.github.id,
      ctx.mod.attrs.accounts.github.username)
    require('../../fixtures/mocks/github/user')(ctx.mod)
    var requestOpts = {
      method: 'POST',
      url: process.env.FULL_API_DOMAIN + '/actions/demoderate',
      json: true,
      jar: ctx.moderatorJar
    }
    request(requestOpts, function (patchErr, patchRes) {
      if (patchErr) { return done(patchErr) }
      expect(patchRes.statusCode).to.equal(204)
      request({
        url: process.env.FULL_API_DOMAIN + '/users/me',
        json: true,
        jar: ctx.moderatorJar
      }, function (err, res, info) {
        if (err) { return done(err) }
        expect(info._id).to.equal(ctx.mod.attrs._id)
        expect(info._beingModerated).to.not.exist()
        done()
      })
    })
  })
})
