/**
 * @module unit/workers/docker.events-stream.disconnected
 */
'use strict'

const clone = require('101/clone')
const Lab = require('lab')
const sinon = require('sinon')

const dockerEventStreamDisconnected = require('workers/docker.events-stream.disconnected').task
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
