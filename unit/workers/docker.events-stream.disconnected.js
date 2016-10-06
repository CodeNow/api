'use strict'

const clone = require('101/clone')
const expect = require('code').expect
const Lab = require('lab')
const sinon = require('sinon')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

const dockerEventStreamDisconnected = require('workers/docker.events-stream.disconnected')
const rabbitMQ = require('models/rabbitmq')

const lab = exports.lab = Lab.script()
const afterEach = lab.afterEach
const beforeEach = lab.beforeEach
const describe = lab.describe
const it = lab.it

describe('docker.events-stream.disconnected unit test', function () {
  const testHost = 'http://host:4242'
  const testOrg = '12345'
  const baseJob = {
    host: testHost,
    org: testOrg
  }
  let testJob

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
        expect(err).to.be.instanceof(WorkerStopError)

        sinon.assert.notCalled(rabbitMQ.publishDockRemoved)
        done()
      })
    })

    it('should throw task fatal if invalid host', function (done) {
      testJob.host = '10.0.0.1:3232'
      dockerEventStreamDisconnected(testJob).asCallback(function (err) {
        expect(err).to.be.instanceof(WorkerStopError)

        sinon.assert.notCalled(rabbitMQ.publishDockRemoved)
        done()
      })
    })

    it('should throw task fatal if missing org', function (done) {
      delete testJob.org
      dockerEventStreamDisconnected(testJob).asCallback(function (err) {
        expect(err).to.be.instanceof(WorkerStopError)

        sinon.assert.notCalled(rabbitMQ.publishDockRemoved)
        done()
      })
    })

    it('should throw task fatal if org not a string', function (done) {
      testJob.org = 12345
      dockerEventStreamDisconnected(testJob).asCallback(function (err) {
        expect(err).to.be.instanceof(WorkerStopError)

        sinon.assert.notCalled(rabbitMQ.publishDockRemoved)
        done()
      })
    })

    it('should throw task fatal if org not a number', function (done) {
      testJob.org = '12a45'
      dockerEventStreamDisconnected(testJob).asCallback(function (err) {
        expect(err).to.be.instanceof(WorkerStopError)

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
          githubOrgId: 12345,
          host: testHost
        })
        done()
      })
    })
  }) // end valid job
}) // end docker.events-stream.disconnected unit test
