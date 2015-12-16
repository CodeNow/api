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
var findIndex = require('101/find-index')
var hasProps = require('101/has-properties')

describe('/users/:id/routes', function () {
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

  describe('POST', function () {
    var testHost = 'somehost'
    var testDest = '55381af91b0a9fdf7e9d6061'
    it('should create a route mapping', function (done) {
      ctx.user.createRoute({
        srcHostname: testHost,
        destInstanceId: testDest
      }, function (err, body, code) {
        if (err) { return done(err) }
        expect(code).to.equal(201)
        expect(body[0].srcHostname).to.equal(testHost)
        expect(body[0].destInstanceId).to.equal(testDest)
        ctx.user.fetch(function (err, body) {
          if (err) { return done(err) }
          expect(body.routes[0].srcHostname).to.equal(testHost)
          expect(body.routes[0].destInstanceId).to.equal(testDest)
          done()
        })
      })
    })
    describe('with hello runnable', function () {
      beforeEach(function (done) {
        ctx.helloRunnable = multi.createHelloRunnableUser(done)
      })
      it('should not create a route mapping', function (done) {
        ctx.helloRunnable.createRoute({
          srcHostname: testHost,
          destInstanceId: testDest
        }, function (err) {
          expect(err.data.statusCode).to.equal(400)
          ctx.helloRunnable.fetch(function (err, body) {
            if (err) { return done(err) }
            expect(body.routes).to.have.length(0)
            done()
          })
        })
      })
    })
    describe('with existing mapping', function () {
      beforeEach(function (done) {
        ctx.user.createRoute({
          srcHostname: testHost,
          destInstanceId: testDest
        }, done)
      })
      it('should override existing route mapping', function (done) {
        var newDest = '55381af91b0a9fdf7e9d6023'
        ctx.user.createRoute({
          srcHostname: testHost,
          destInstanceId: newDest
        }, function (err, body, code) {
          if (err) { return done(err) }
          expect(code).to.equal(201)
          expect(body.length).to.equal(1)
          expect(body[0].srcHostname).to.equal(testHost)
          expect(body[0].destInstanceId).to.equal(newDest)
          ctx.user.fetch(function (err, body) {
            if (err) { return done(err) }
            expect(body.routes.length).to.equal(1)
            expect(body.routes[0].srcHostname).to.equal(testHost)
            expect(body.routes[0].destInstanceId).to.equal(newDest)
            done()
          })
        })
      })
    })
  })
  describe('GET', function () {
    describe('with no routes', function () {
      it('should get nothing', function (done) {
        ctx.user.fetchRoutes(function (err, body, code) {
          if (err) { return done(err) }
          expect(code).to.equal(200)
          expect(body.length).to.equal(0)
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
      it('should get all mapped routes', function (done) {
        ctx.user.fetchRoutes(function (err, body, code) {
          if (err) { return done(err) }
          expect(code).to.equal(200)
          expect(body.length).to.equal(2)
          expect(findIndex(body, hasProps({
            srcHostname: testHost,
            destInstanceId: testDest
          }))).to.not.equal(-1)
          expect(findIndex(body, hasProps({
            srcHostname: testHost2,
            destInstanceId: testDest2
          }))).to.not.equal(-1)
          done()
        })
      })
    })
  })
})
