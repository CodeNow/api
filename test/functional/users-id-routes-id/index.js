'use strict'
require('loadenv')()

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var expect = require('code').expect
var it = lab.it
var after = lab.after
var afterEach = lab.afterEach
var before = lab.before
var beforeEach = lab.beforeEach

var api = require('../fixtures/api-control')
var multi = require('../fixtures/multi-factory')

describe('/users/:id/routes/:id', function () {
  var ctx = {}
  before(api.start.bind(ctx))
  beforeEach(require('../fixtures/mocks/github/login'))
  beforeEach(require('../fixtures/mocks/github/login'))
  beforeEach(function (done) {
    ctx.user = multi.createUser(done)
  })
  afterEach(require('../fixtures/clean-mongo').removeEverything)
  afterEach(require('../fixtures/clean-ctx')(ctx))
  afterEach(require('../fixtures/clean-nock'))
  after(api.stop.bind(ctx))

  describe('DELETE', function () {
    describe('with no routes', function () {
      it('should get nothing', function (done) {
        ctx.user.destroyRoute('noHost', function (err, body, code) {
          if (err) { return done(err) }
          expect(code).to.equal(204)
          done()
        })
      })
    })
    describe('with 2 routes', function () {
      var testHost = 'somehost'
      var testDest = '55381af91b0a9fdf7e9d6061'
      var testHost2 = 'anotherHost'
      var testDest2 = '55381af91b010fdf7e9d6061'
      beforeEach(function (done) {
        ctx.user.createRoute({
          srcHostname: testHost,
          destInstanceId: testDest
        }, done)
      })
      beforeEach(function (done) {
        ctx.user.createRoute({
          srcHostname: testHost2,
          destInstanceId: testDest2
        }, done)
      })
      it('should delete hostname', function (done) {
        ctx.user.destroyRoute(testHost, function (err, body, code) {
          if (err) { return done(err) }
          expect(code).to.equal(204)
          ctx.user.fetch(function (err, body) {
            if (err) { return done(err) }
            expect(body.routes.length).to.equal(1)
            expect(body.routes[0].srcHostname).to.equal(testHost2)
            expect(body.routes[0].destInstanceId).to.equal(testDest2)
            done()
          })
        })
      })
    })
  })
})
