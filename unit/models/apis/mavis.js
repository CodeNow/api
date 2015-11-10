'use strict'

require('loadenv')()

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var Code = require('code')
var expect = Code.expect

var Mavis = require('models/apis/mavis')
var sinon = require('sinon')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('mavis.js unit test: ' + moduleName, function () {
  var ctx = {}
  beforeEach(function (done) {
    ctx.mavis = new Mavis()
    done()
  })
  describe('findDockForBuild', function () {
    it('should error if missing contextVersion', function (done) {
      ctx.mavis.findDockForBuild(null, null, function (err) {
        expect(err).to.exist()
        done()
      })
    })
    it('should error if missing context', function (done) {
      ctx.mavis.findDockForBuild({}, null, function (err) {
        expect(err).to.exist()
        done()
      })
    })
    describe('should send correct inputs to findDock', function () {
      var testOrgId = 23894759
      var testContext = {
        owner: { github: testOrgId }
      }
      beforeEach(function (done) {
        sinon.stub(ctx.mavis, 'findDock').yieldsAsync()
        done()
      })
      afterEach(function (done) {
        ctx.mavis.findDock.restore()
        done()
      })
      it('no duration, no dockerTag', function (done) {
        ctx.mavis.findDockForBuild({}, testContext, function () {
          expect(ctx.mavis.findDock.calledWith({
            type: 'container_build',
            tags: testOrgId + ',build',
            prevDuration: 0,
            prevImage: null
          })).to.be.true()
          done()
        })
      })
      it('w/duration, w/dockerTag', function (done) {
        var testDur = 1283956
        var testTag = 'runnatag'
        ctx.mavis.findDockForBuild({
          duration: testDur,
          dockerTag: testTag
        }, testContext, function () {
          expect(ctx.mavis.findDock.calledWith({
            type: 'container_build',
            tags: testOrgId + ',build',
            prevDuration: testDur,
            prevImage: testTag
          })).to.be.true()
          done()
        })
      })
    })
  })
  describe('findDockForContainer', function () {
    it('should error if missing contextVersion', function (done) {
      ctx.mavis.findDockForContainer(null, function (err) {
        expect(err).to.exist()
        done()
      })
    })
    it('should error if missing contextVersion owner', function (done) {
      ctx.mavis.findDockForContainer({}, function (err) {
        expect(err).to.exist()
        done()
      })
    })
    describe('should send correct inputs to findDock', function () {
      var testOrgId = 23894759
      var testContextVersion
      beforeEach(function (done) {
        testContextVersion = {
          owner: { github: testOrgId }
        }
        sinon.stub(ctx.mavis, 'findDock').yieldsAsync()
        done()
      })
      afterEach(function (done) {
        ctx.mavis.findDock.restore()
        done()
      })
      it('no dockerHost', function (done) {
        ctx.mavis.findDockForContainer(testContextVersion, function () {
          expect(ctx.mavis.findDock.calledWith({
            type: 'container_run',
            tags: testOrgId + ',run',
            prevDock: null
          })).to.be.true()
          done()
        })
      })
      it('w/dockerHost', function (done) {
        var testHost = 'godaddy'
        testContextVersion.dockerHost = testHost
        ctx.mavis.findDockForContainer(testContextVersion, function () {
          expect(ctx.mavis.findDock.calledWith({
            type: 'container_run',
            tags: testOrgId + ',run',
            prevDock: testHost
          })).to.be.true()
          done()
        })
      })
    })
  })
  describe('findDock', function () {
    beforeEach(function (done) {
      sinon.stub(ctx.mavis, 'post')
      done()
    })
    afterEach(function (done) {
      ctx.mavis.post.restore()
      done()
    })
    it('should boom 504 if error making request', function (done) {
      var testErr = 'Mugetsu'
      ctx.mavis.post.yieldsAsync(testErr)
      ctx.mavis.findDock({}, function (err) {
        expect(err.output.statusCode).to.equal(504)
        done()
      })
    })
    it('should retry with default if statusCode 503 and not default', function (done) {
      var testHost = 'ipage'
      ctx.mavis.post.onFirstCall().yieldsAsync(null, {
        statusCode: 503
      })
      ctx.mavis.post.onSecondCall().yieldsAsync(null, {
        statusCode: 200,
        body: {
          dockHost: testHost
        }
      })
      ctx.mavis.findDock({tags: '2398457'}, function (err, host) {
        expect(err).to.not.exist()
        expect(host).to.equal(testHost)
        done()
      })
    })
    it('should boom error if statusCode > 300', function (done) {
      ctx.mavis.post.yieldsAsync(null, {
        statusCode: 401,
        request: {uri: 'some test'},
        body: 'some body'
      })
      ctx.mavis.findDock({}, function (err) {
        expect(err.output.statusCode).to.equal(401)
        done()
      })
    })
    it('should cb host if 200', function (done) {
      var testHost = 'web.com'
      ctx.mavis.post.yieldsAsync(null, {
        statusCode: 200,
        body: {dockHost: testHost}
      })
      ctx.mavis.findDock({}, function (err, host) {
        expect(err).to.not.exist()
        expect(host).to.equal(testHost)
        done()
      })
    })
  })
})
