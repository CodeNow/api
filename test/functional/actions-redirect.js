'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var after = lab.after
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect

var request = require('request')
var api = require('./fixtures/api-control')

describe('Actions - /actions/redirect', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  after(api.stop.bind(ctx))
  before(require('./fixtures/mocks/api-client').setup)
  after(require('./fixtures/mocks/api-client').clean)
  afterEach(require('./fixtures/clean-mongo').removeEverything)
  afterEach(require('./fixtures/clean-ctx')(ctx))

  it('should not redirect non-github url', function (done) {
    var url = 'http://localhost:' + process.env.PORT + '/actions/redirect?url=http://google.com'
    var options = {
      method: 'GET',
      url: url
    }
    request(options, function (err, res) {
      if (err) { return done(err) }
      expect(res.statusCode).to.equal(404)
      done()
    })
  })

  it('should redirect github url', function (done) {
    var repo = decodeURIComponent('https://github.com/podviaznikov/hellonode')
    var url = 'http://localhost:' + process.env.PORT + '/actions/redirect?url=' + repo
    var options = {
      method: 'GET',
      url: url,
      followRedirect: false
    }
    request(options, function (err, res) {
      if (err) { return done(err) }
      expect(res.statusCode).to.equal(302)
      expect(res.body).to.equal('Moved Temporarily. Redirecting to https://github.com/podviaznikov/hellonode')
      done()
    })
  })
})
