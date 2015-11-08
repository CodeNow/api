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
describe('DELETE /auth', function () {
  before(api.start.bind(ctx))
  after(api.stop.bind(ctx))
  beforeEach(function (done) {
    ctx.name = randStr(5)
    done()
  })
  before(function (done) {
    ctx.j = request.jar()
    require('../../fixtures/multi-factory').createUser({
      requestDefaults: { jar: ctx.j }
    }, function (err, user) {
      ctx.user = user
      done(err)
    })
  })
  afterEach(require('../../fixtures/clean-mongo').removeEverything)

  it('should log a user out', function (done) {
    var opts = {
      method: 'DELETE',
      url: process.env.FULL_API_DOMAIN + '/auth',
      json: true,
      jar: ctx.j
    }
    request(opts, function (err, res) {
      expect(err).to.be.null()
      expect(res).to.exist()
      expect(res.statusCode).to.equal(200)
      ctx.user.fetch(function (fetchErr) {
        expect(fetchErr).to.exist()
        expect(fetchErr.output.statusCode).to.equal(401)
        done()
      })
    })
  })
})
