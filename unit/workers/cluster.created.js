/**
 * @module unit/workers/cluster.created
 */
'use strict'

const Lab = require('lab')
const lab = exports.lab = Lab.script()

const afterEach = lab.afterEach
const beforeEach = lab.beforeEach
const describe = lab.describe
const expect = require('code').expect
const it = lab.it

const Promise = require('bluebird')
const pick = require('101/pick')
const sinon = require('sinon')
require('sinon-as-promised')(Promise)

const rabbitMQ = require('models/rabbitmq')
const Worker = require('workers/cluster.created')

describe('Cluster Created Worker', function () {
  describe('worker', function () {
    const testAutoIsolationConfigId = '6768f58160e9990d009c9427'
    const testClusterConfigId = '7768f58160e9990d009c9428'
    const testOrgBigPoppaId = 20001
    const testInstanceDef1 = {
      metadata: {
        isMain: false
      },
      contextVersion: {
        advanced: true
      },
      instance: {
        name: 'reids'
      }
    }
    const testInstanceDef2 = {
      metadata: {
        isMain: false
      },
      contextVersion: {
        advanced: true
      },
      instance: {
        name: 'mongo'
      }
    }
    const testData = {
      autoIsolationConfig: {
        id: testAutoIsolationConfigId
      },
      inputClusterConfig: {
        id: testClusterConfigId
      },
      parsedCompose: {
        results: [ testInstanceDef1, testInstanceDef2 ]
      },
      user: {
        id: 123
      },
      triggeredAction: 'user',
      repoFullName: 'Runnable/api',
      organization: {
        id: testOrgBigPoppaId
      }
    }
    beforeEach(function (done) {
      sinon.stub(rabbitMQ, 'createClusterInstance').returns()
      done()
    })

    afterEach(function (done) {
      rabbitMQ.createClusterInstance.restore()
      done()
    })

    describe('errors', function () {
      it('should reject with any rabbitMQ.createClusterInstance error', function (done) {
        const rabbitError = new Error('Rabbit failed')
        rabbitMQ.createClusterInstance.throws(rabbitError)
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(rabbitError)
          done()
        })
      })
    })

    describe('success', function () {
      it('should return no error', function (done) {
        Worker.task(testData).asCallback(done)
      })

      it('should call rabbit twice', function (done) {
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledTwice(rabbitMQ.createClusterInstance)
          const basePayload = pick(testData, ['autoIsolationConfig', 'inputClusterConfig', 'user', 'organization', 'triggeredAction', 'repoFullName'])
          const job1 = Object.assign({ parsedComposeInstanceData: testInstanceDef1 }, basePayload)
          const job2 = Object.assign({ parsedComposeInstanceData: testInstanceDef2 }, basePayload)
          sinon.assert.calledWithExactly(rabbitMQ.createClusterInstance, job1)
          sinon.assert.calledWithExactly(rabbitMQ.createClusterInstance, job2)
          done()
        })
      })
    })
  })
})
