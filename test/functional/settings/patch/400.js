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
var multi = require('../../fixtures/multi-factory')

describe('400 PATCH /settings/:id', function () {
  var ctx = {}
  before(api.start.bind(ctx))
  after(api.stop.bind(ctx))
  before(require('../../fixtures/mocks/api-client').setup)
  after(require('../../fixtures/mocks/api-client').clean)
  afterEach(require('../../fixtures/clean-mongo').removeEverything)
  afterEach(require('../../fixtures/clean-ctx')(ctx))
  afterEach(require('../../fixtures/clean-nock'))

  describe('update settings', function () {
    beforeEach(function (done) {
      ctx.user = multi.createUser(done)
    })

    it('should fail updating non-existing setting', function (done) {
      ctx.user.newSetting('000000000000000000000000').update({json: {}}, function (err) {
        expect(err.data.statusCode).to.equal(404)
        expect(err.data.message).to.equal('Setting not found')
        done()
      })
    })
  })
})
