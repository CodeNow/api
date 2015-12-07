'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var before = lab.before
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach
var it = lab.it
var after = lab.after
var Code = require('code')
var expect = Code.expect

var put = require('101/put')
var api = require('../../fixtures/api-control')
var multi = require('../../fixtures/multi-factory')

describe('200 PATCH /contexts/:contextid/versions/:id', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  before(require('../../fixtures/mocks/api-client').setup)
  after(api.stop.bind(ctx))
  after(require('../../fixtures/mocks/api-client').clean)
  afterEach(require('../../fixtures/clean-mongo').removeEverything)
  afterEach(require('../../fixtures/clean-ctx')(ctx))
  afterEach(require('../../fixtures/clean-nock'))

  beforeEach(function (done) {
    multi.createContextVersion(function (err, cv) {
      if (err) { return done(err) }
      ctx.cv = cv
      done()
    })
  })

  it('should update advanced', function (done) {
    expect(ctx.cv.json().advanced).to.be.false()
    var expected = put(ctx.cv.json(), 'advanced', true)
    ctx.cv.update({ advanced: true }, function (err, body, statusCode) {
      if (err) { return done(err) }
      expect(statusCode).to.equal(200)
      expect(body).to.deep.equal(expected)
      done()
    })
  })

  it('should update dockRemovedNeedsUserConfirmation', function (done) {
    expect(ctx.cv.json().dockRemovedNeedsUserConfirmation).to.be.false()
    var expected = put(ctx.cv.json(), 'dockRemovedNeedsUserConfirmation', true)
    ctx.cv.update({ dockRemovedNeedsUserConfirmation: true }, function (err, body, statusCode) {
      if (err) { return done(err) }
      expect(statusCode).to.equal(200)
      expect(body).to.deep.equal(expected)
      done()
    })
  })
})
