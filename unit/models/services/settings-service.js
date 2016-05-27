'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach

var expect = require('code').expect
var sinon = require('sinon')
require('sinon-as-promised')(require('bluebird'))

var Settings = require('models/mongo/settings')
var SettingsService = require('models/services/settings-service')

describe('SettingsService', function () {
  describe('createNew', function (done) {
    beforeEach(function (done) {
      sinon.stub(Settings, 'createAsync').returns({})
      done()
    })
    afterEach(function (done) {
      Settings.createAsync.restore()
      done()
    })

    it('should fail if payload is null', function (done) {
      SettingsService.createNew(null)
        .then(function () {
          done(new Error('Should fail'))
        })
        .catch(function (err) {
          expect(err.message).to.equal('"settings" must be an object')
          done()
        })
    })

    it('should fail if payload is empty {}', function (done) {
      SettingsService.createNew({})
        .then(function () {
          done(new Error('Should fail'))
        })
        .catch(function (err) {
          expect(err.message).to.equal('"owner" is required')
          done()
        })
    })

    it('should fail if owner.github is null', function (done) {
      SettingsService.createNew({ owner: {} })
        .then(function () {
          done(new Error('Should fail'))
        })
        .catch(function (err) {
          expect(err.message).to.equal('"owner.github" is required')
          done()
        })
    })

    it('should fail if owner.github is string', function (done) {
      SettingsService.createNew({ owner: { github: 'anton' } })
        .then(function () {
          done(new Error('Should fail'))
        })
        .catch(function (err) {
          expect(err.message).to.equal('"owner.github" must be a number')
          done()
        })
    })

    it('should fail if notifications is not an object', function (done) {
      var payload = {
        owner: { github: 1 },
        notifications: 'string'
      }
      SettingsService.createNew(payload)
        .then(function () {
          done(new Error('Should fail'))
        })
        .catch(function (err) {
          expect(err.message).to.equal('"notifications" must be an object')
          done()
        })
    })

    it('should fail if notifications.slack is not an object', function (done) {
      var payload = {
        owner: { github: 1 },
        notifications: {
          slack: 'string'
        }
      }
      SettingsService.createNew(payload)
        .then(function () {
          done(new Error('Should fail'))
        })
        .catch(function (err) {
          expect(err.message).to.equal('"notifications.slack" must be an object')
          done()
        })
    })

    it('should fail if notifications.slack.apiToken is not a string', function (done) {
      var payload = {
        owner: { github: 1 },
        notifications: {
          slack: {
            apiToken: {}
          }
        }
      }
      SettingsService.createNew(payload)
        .then(function () {
          done(new Error('Should fail'))
        })
        .catch(function (err) {
          expect(err.message).to.equal('"notifications.slack.apiToken" must be a string')
          done()
        })
    })

    it('should fail if ignoredHelpCards is not an object', function (done) {
      var payload = {
        owner: { github: 1 },
        ignoredHelpCards: 'string'
      }
      SettingsService.createNew(payload)
        .then(function () {
          done(new Error('Should fail'))
        })
        .catch(function (err) {
          expect(err.message).to.equal('"ignoredHelpCards" must be an object')
          done()
        })
    })

    it('should pass validation if all data is valid', function (done) {
      var payload = {
        owner: { github: 1 },
        notifications: {
          slack: {
            apiToken: 'token'
          }
        },
        ignoredHelpCards: {}
      }
      SettingsService.createNew(payload).asCallback(done)
    })

    it('should fail if db call failed', function (done) {
      var payload = {
        owner: { github: 1 },
        notifications: {
          slack: {
            apiToken: 'token'
          }
        },
        ignoredHelpCards: {}
      }
      Settings.createAsync.rejects(new Error('Mongo error'))
      SettingsService.createNew(payload)
      .then(function () {
        done(new Error('Should fail'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('Mongo error')
        done()
      })
    })

    it('should call db method with correct payload', function (done) {
      var payload = {
        owner: { github: 1 },
        notifications: {
          slack: {
            apiToken: 'token'
          }
        },
        ignoredHelpCards: {}
      }
      SettingsService.createNew(payload)
        .tap(function () {
          sinon.assert.calledOnce(Settings.createAsync)
          sinon.assert.calledWith(Settings.createAsync, payload)
        })
        .asCallback(done)
    })
  })
})
