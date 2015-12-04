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

describe('400 PATCH /contexts/:contextid/versions/:id', function () {
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

  it('should handle error with dockRemovedNeedsUserConfirmation', function (done) {
    ctx.cv.update({ dockRemovedNeedsUserConfirmation: '1234' }, function (err) {
      expect(err.message).to.contain('must be a boolean')
      expect(err.message).to.contain('dockRemovedNeedsUserConfirmation')
      done()
    })
  })

  it('should handle error with advanced', function (done) {
    ctx.cv.update({ advanced: '1234' }, function (err) {
      expect(err.message).to.contain('must be a boolean')
      expect(err.message).to.contain('advanced')
      done()
    })
  })
})
