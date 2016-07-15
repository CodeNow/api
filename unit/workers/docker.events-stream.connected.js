/**
 * @module unit/workers/docker.events-stream.connected
 */
'use strict'

var clone = require('101/clone')
var expect = require('code').expect
var Lab = require('lab')
var Promise = require('bluebird')
var sinon = require('sinon')
require('sinon-as-promised')(Promise)
var TaskFatalError = require('ponos').TaskFatalError

var dockerEventStreamConnected = require('workers/docker.events-stream.connected')
var messenger = require('socket/messenger')
var rabbitMQ = require('models/rabbitmq')
var UserWhitelist = require('models/mongo/user-whitelist')

var lab = exports.lab = Lab.script()
var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var it = lab.it

describe('docker.events-stream.connected unit test', function () {
  var testHost = 'http://host:4242'
  var testOrg = '12345'
  var baseJob = {
    host: testHost,
    org: testOrg
  }
  var testJob

  beforeEach(function (done) {
    testJob = clone(baseJob)
    sinon.stub(UserWhitelist, 'updateAsync').resolves(1)
    sinon.stub(rabbitMQ, 'firstDockCreated').returns()
    sinon.stub(messenger, 'emitFirstDockCreated').returns()
    done()
  })

  afterEach(function (done) {
    UserWhitelist.updateAsync.restore()
    rabbitMQ.firstDockCreated.restore()
    messenger.emitFirstDockCreated.restore()
    done()
  })

  describe('validate', function () {
    it('should throw task fatal if missing host', function (done) {
      delete testJob.host
      dockerEventStreamConnected(testJob).asCallback(function (err) {
        expect(err).to.be.instanceof(TaskFatalError)
        sinon.assert.notCalled(UserWhitelist.updateAsync)
        done()
      })
    })

    it('should throw task fatal if invalid host', function (done) {
      testJob.host = '10.0.0.1:3232'
      dockerEventStreamConnected(testJob).asCallback(function (err) {
        expect(err).to.be.instanceof(TaskFatalError)
        sinon.assert.notCalled(UserWhitelist.updateAsync)
        done()
      })
    })

    it('should throw task fatal if missing org', function (done) {
      delete testJob.org
      dockerEventStreamConnected(testJob).asCallback(function (err) {
        expect(err).to.be.instanceof(TaskFatalError)
        sinon.assert.notCalled(UserWhitelist.updateAsync)
        done()
      })
    })

    it('should throw task fatal if org not a string', function (done) {
      testJob.org = 12345
      dockerEventStreamConnected(testJob).asCallback(function (err) {
        expect(err).to.be.instanceof(TaskFatalError)
        sinon.assert.notCalled(UserWhitelist.updateAsync)
        done()
      })
    })

    it('should throw task fatal if org not a number', function (done) {
      testJob.org = '12a45'
      dockerEventStreamConnected(testJob).asCallback(function (err) {
        expect(err).to.be.instanceof(TaskFatalError)
        sinon.assert.notCalled(UserWhitelist.updateAsync)
        done()
      })
    })
  }) // end validate

  describe('valid job', function () {
    it('should fail if mongo update failed', function (done) {
      UserWhitelist.updateAsync.rejects(new Error('Mongo error'))
      dockerEventStreamConnected(testJob)
      .then(function () {
        done(new Error('Should never happen'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('Mongo error')
        done()
      })
    })

    it('should fail if no records were updates', function (done) {
      UserWhitelist.updateAsync.resolves(0)
      dockerEventStreamConnected(testJob)
      .then(function () {
        done(new Error('Should never happen'))
      })
      .catch(function (err) {
        expect(err).to.be.instanceof(TaskFatalError)
        expect(err.message).to.include('firstDockCreated was set before')
        done()
      })
    })

    it('should fatally fail if messenger call failed', function (done) {
      messenger.emitFirstDockCreated.throws(new Error('Primus error'))
      dockerEventStreamConnected(testJob)
      .then(function () {
        done(new Error('Should never happen'))
      })
      .catch(function (err) {
        expect(err).to.be.instanceof(TaskFatalError)
        expect(err.message).to.include('Failed to create job or send websocket event')
        expect(err.data.err.message).to.equal('Primus error')
        done()
      })
    })

    it('should fatally fail if rabbimq call failed', function (done) {
      rabbitMQ.firstDockCreated.throws(new Error('Rabbit error'))
      dockerEventStreamConnected(testJob)
      .then(function () {
        done(new Error('Should never happen'))
      })
      .catch(function (err) {
        expect(err).to.be.instanceof(TaskFatalError)
        expect(err.message).to.include('Failed to create job or send websocket event')
        expect(err.data.err.message).to.equal('Rabbit error')
        done()
      })
    })

    it('should call UserWhitelist.updateAsync with correct params', function (done) {
      dockerEventStreamConnected(testJob)
      .tap(function () {
        sinon.assert.calledOnce(UserWhitelist.updateAsync)
        sinon.assert.calledWith(UserWhitelist.updateAsync,
          { firstDockCreated: false,
            githubId: parseInt(testOrg, 10)
          },
          { $set: { firstDockCreated: true } })
      })
      .asCallback(done)
    })

    it('should call messenger.emitFirstDockCreated with correct params', function (done) {
      dockerEventStreamConnected(testJob)
      .tap(function () {
        sinon.assert.calledOnce(messenger.emitFirstDockCreated)
        sinon.assert.calledWith(messenger.emitFirstDockCreated, parseInt(testOrg, 10))
      })
      .asCallback(done)
    })

    it('should call rabbitMQ.firstDockCreated with correct params', function (done) {
      dockerEventStreamConnected(testJob)
      .tap(function () {
        sinon.assert.calledOnce(rabbitMQ.firstDockCreated)
        sinon.assert.calledWith(rabbitMQ.firstDockCreated,
          {
            githubId: parseInt(testOrg, 10)
          }
        )
      })
      .asCallback(done)
    })

    it('should call all functions in order', function (done) {
      dockerEventStreamConnected(testJob)
      .tap(function () {
        sinon.assert.callOrder(
          UserWhitelist.updateAsync,
          messenger.emitFirstDockCreated,
          rabbitMQ.firstDockCreated)
      })
      .asCallback(done)
    })
  }) // end valid job
}) // end docker.events-stream.connected unit test
