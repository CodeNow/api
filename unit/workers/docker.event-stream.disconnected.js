/**
 * @module unit/workers/docker.events-stream.disconnected
 */
'use strict'

var clone = require('101/clone')
var expect = require('code').expect
var Lab = require('lab')
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

var dockerEventStreamDisconnected = require('workers/docker.events-stream.disconnected')
var rabbitMQ = require('models/rabbitmq')

var lab = exports.lab = Lab.script()
var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var it = lab.it

describe('docker.events-stream.disconnected unit test', function () {
  var testHost = 'http://host:4242'
  var testOrg = '12345'
  var baseJob = {
    host: testHost,
    org: testOrg
  }
  var testJob

  beforeEach(function (done) {
    testJob = clone(baseJob)
    sinon.stub(rabbitMQ, 'publishDockRemoved')
    done()
  })

  afterEach(function (done) {
    rabbitMQ.publishDockRemoved.restore()
    done()
  })

  describe('validate', function () {
    it('should throw task fatal if missing host', function (done) {
      delete testJob.host
      dockerEventStreamDisconnected(testJob).asCallback(function (err) {
        expect(err).to.be.instanceof(TaskFatalError)

        sinon.assert.notCalled(rabbitMQ.publishDockRemoved)
        done()
      })
    })

    it('should throw task fatal if invalid host', function (done) {
      testJob.host = '10.0.0.1:3232'
      dockerEventStreamDisconnected(testJob).asCallback(function (err) {
        expect(err).to.be.instanceof(TaskFatalError)

        sinon.assert.notCalled(rabbitMQ.publishDockRemoved)
        done()
      })
    })

    it('should throw task fatal if missing org', function (done) {
      delete testJob.org
      dockerEventStreamDisconnected(testJob).asCallback(function (err) {
        expect(err).to.be.instanceof(TaskFatalError)

        sinon.assert.notCalled(rabbitMQ.publishDockRemoved)
        done()
      })
    })

    it('should throw task fatal if invalid org', function (done) {
      testJob.org = 12345
      dockerEventStreamDisconnected(testJob).asCallback(function (err) {
        expect(err).to.be.instanceof(TaskFatalError)

        sinon.assert.notCalled(rabbitMQ.publishDockRemoved)
        done()
      })
    })
  }) // end validate

  describe('valid job', function () {
    it('should publish dock removed', function (done) {
      dockerEventStreamDisconnected(testJob).asCallback(function (err) {
        if (err) { return done(err) }

        sinon.assert.calledOnce(rabbitMQ.publishDockRemoved)
        sinon.assert.calledWith(rabbitMQ.publishDockRemoved, {
          githubId: 12345,
          host: testHost
        })
        done()
      })
    })
  }) // end valid job
}) // end docker.events-stream.disconnected unit test
