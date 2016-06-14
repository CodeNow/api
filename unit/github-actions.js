'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach

var Boom = require('dat-middleware').Boom
var Code = require('code')
var expect = Code.expect
var Promise = require('bluebird')
var sinon = require('sinon')
var monitor = require('monitor-dog')

var EmptyResponseError = require('errors/empty-response-error')
var NotImplementedError = require('errors/not-implemented-error')

var githubActions = require('routes/actions/github')
var WebhookService = require('models/services/webhook-service')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)
require('sinon-as-promised')(Promise)

describe('GitHub Actions: ' + moduleName, function () {
  var validHeaders = {}
  var req
  var res
  beforeEach(function (done) {
    validHeaders = {
      'user-agent': 'GitHub stuff',
      'x-github-delivery': 'sadasdasda',
      'x-github-event': 'push'
    }
    req = {
      headers: validHeaders,
      get: sinon.spy(function (i) {
        return req.headers[i]
      })
    }
    res = {}
    res.status = sinon.stub().returns(res)
    res.send = sinon.stub().returns(res)
    done()
  })
  describe('areHeadersValidGithubEvent', function () {
    describe('Invalid headers', function () {
      it('should be invalid for an empty header', function (done) {
        expect(githubActions.areHeadersValidGithubEvent()).to.equal(false)
        done()
      })
      it('should be invalid if the userAgent isn\'t github', function (done) {
        expect(githubActions.areHeadersValidGithubEvent({
          'user-agent': 'nope'
        })).to.equal(false)
        done()
      })
      it('should be invalid if the x-github-event is missing', function (done) {
        expect(githubActions.areHeadersValidGithubEvent({
          'user-agent': 'GitHub stuff'
        })).to.equal(false)
        done()
      })
      it('should be invalid if the x-github-delivery is missing', function (done) {
        expect(githubActions.areHeadersValidGithubEvent({
          'user-agent': 'GitHub stuff'
        })).to.equal(false)
        done()
      })
    })
    it('should return true with a valid header', function (done) {
      expect(githubActions.areHeadersValidGithubEvent({
        'user-agent': 'GitHub stuff',
        'x-github-delivery': 'sadasdasda',
        'x-github-event': 'asdasdasdsad'
      })).to.equal(true)
      done()
    })
  })

  describe('onGithookEvent', function () {
    beforeEach(function (done) {
      sinon.stub(monitor, 'increment').returns()
      done()
    })
    afterEach(function (done) {
      monitor.increment.restore()
      done()
    })
    describe('invalid headers', function () {
      it('should return 400', function (done) {
        delete validHeaders['x-github-event']
        githubActions.onGithookEvent(req, res, function (err) {
          expect(err.output.statusCode).to.equal(400) // Bad Request
          expect(err.output.payload.message).to.match(/Invalid githook/)
          done()
        })
      })
    })
    describe('ping', function () {
      it('should return OKAY', function (done) {
        validHeaders['x-github-event'] = 'ping'
        githubActions.onGithookEvent(req, res, function (err, res) {
          sinon.assert.calledOnce(res.status)
          sinon.assert.calledWith(res.status, 202)
          sinon.assert.calledWith(res.send, 'Hello, Github Ping!')
          done()
        })
      })
    })

    describe('not a push event', function () {
      it('should return no action', function (done) {
        validHeaders['x-github-event'] = 'pull request'
        githubActions.onGithookEvent(req, res, function (err, res) {
          sinon.assert.calledOnce(res.status)
          sinon.assert.calledWith(res.status, 202)
          sinon.assert.calledWith(res.send, 'No action set up for that payload.')
          done()
        })
      })
    })

    describe('disabled hooks', function () {
      beforeEach(function (done) {
        delete process.env.ENABLE_GITHUB_HOOKS
        done()
      })
      afterEach(function (done) {
        process.env.ENABLE_GITHUB_HOOKS = true
        done()
      })
      it('should send response immediately if hooks are disabled', function (done) {
        githubActions.onGithookEvent(req, res, function (err, res) {
          sinon.assert.calledOnce(res.status)
          sinon.assert.calledWith(res.status, 202)
          sinon.assert.calledWith(res.send, 'Hooks are currently disabled, but we gotchu!')
          done()
        })
      })
    })
    describe('process', function () {
      beforeEach(function (done) {
        sinon.stub(WebhookService, 'processGithookEvent')
        done()
      })
      afterEach(function (done) {
        WebhookService.processGithookEvent.restore()
        done()
      })
      it('resolves successfully', function (done) {
        WebhookService.processGithookEvent.resolves()
        githubActions.onGithookEvent(req, res, function (err, res) {
          sinon.assert.calledOnce(res.status)
          sinon.assert.calledWith(res.status, 200)
          sinon.assert.calledWith(res.send, 'Success')
          done()
        })
      })
      it('should respond with 403 if processGithookEvent returns that', function (done) {
        var boomError = Boom.forbidden('Repo owner is not registered on Runnable')
        WebhookService.processGithookEvent.rejects(boomError)
        githubActions.onGithookEvent(req, res, function (err, res) {
          sinon.assert.notCalled(res.status)
          expect(err).to.equal(boomError)
          done()
        })
      })
      it('should respond with a 202 when it fails with a NotImplementedError', function (done) {
        var error = new NotImplementedError('Nope', 'Error')
        WebhookService.processGithookEvent.rejects(error)
        githubActions.onGithookEvent(req, res, function (err, res) {
          sinon.assert.calledOnce(res.status)
          sinon.assert.calledWith(res.status, 202)
          sinon.assert.calledWith(res.send, 'Error')
          done()
        })
      })
      it('should respond with a 202 when it fails with an EmptyResponseError', function (done) {
        var error = new EmptyResponseError('Nope', 'Another error')
        WebhookService.processGithookEvent.rejects(error)
        githubActions.onGithookEvent(req, res, function (err, res) {
          sinon.assert.calledOnce(res.status)
          sinon.assert.calledWith(res.status, 202)
          sinon.assert.calledWith(res.send, 'Another error')
          done()
        })
      })
    })
  })

})
