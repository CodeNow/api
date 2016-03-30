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
var multi = require('../../fixtures/multi-factory')
var Github = require('models/apis/github')
var getUserEmails = require('../../fixtures/mocks/github/get-user-emails')
var request = require('request')

describe('Moderate - /actions/moderate', function () {
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
    sinon.stub(Github.prototype, 'getUserEmails', function (email, cb) {
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

  describe('moderating', function () {
    beforeEach(function (done) { ctx.user = multi.createUser(done) })
    beforeEach(function (done) {
      ctx.moderatorJar = request.jar()
      ctx.mod = multi.createModerator({
        requestDefaults: { jar: ctx.moderatorJar }
      }, done)
    })

    it('should only return our user object by default', function (done) {
      ctx.mod.fetch(function (err, info) {
        if (err) { return done(err) }
        expect(info._id).to.equal(ctx.mod.attrs._id)
        expect(info._beingModerated).to.not.exist()
        done()
      })
    })
    it('should allow us to change users', function (done) {
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
      request(requestOpts, function (patchErr, patchRes) {
        if (patchErr) { return done(patchErr) }
        expect(patchRes.statusCode).to.equal(200)
        request({
          url: process.env.FULL_API_DOMAIN + '/users/me',
          json: true,
          jar: ctx.moderatorJar
        }, function (err, res, info) {
          if (err) { return done(err) }
          expect(info._id).to.equal(ctx.user.attrs._id)
          expect(info._beingModerated).to.exist()
          expect(info._beingModerated._id).to.equal(ctx.mod.attrs._id)
          done()
        })
      })
    })
  })
})
