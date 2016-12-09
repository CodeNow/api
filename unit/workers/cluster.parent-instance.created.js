/**
 * @module unit/workers/cluster.parent-instance.created
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
const Worker = require('workers/cluster.parent-instance.created')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

describe('Cluster Sibling Instance Create Worker', function () {
  describe('worker', function () {
    const testClusterId = '7768f58160e9990d009c9428'
    const testOrgBigPoppaId = 20001
    const testSibling1 = {
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
    const testSibling2 = {
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
      cluster: {
        id: testClusterId
      },
      parsedCompose: {
        results: [ testSibling1, testSibling2 ]
      },
      sessionUserGithubId: 123,
      triggeredAction: 'user',
      repoFullName: 'Runnable/api',
      organization: {
        id: testOrgBigPoppaId
      }
    }
    beforeEach(function (done) {
      sinon.stub(rabbitMQ, 'createClusterSiblingInstance').returns()
      done()
    })

    afterEach(function (done) {
      rabbitMQ.createClusterSiblingInstance.restore()
      done()
    })

    describe('errors', function () {
      it('should reject with any UserService.getCompleteUserByBigPoppaId error', function (done) {
        const rabbitError = new Error('Rabbit failed')
        rabbitMQ.createClusterSiblingInstance.throws(rabbitError)
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(rabbitError)
          done()
        })
      })

      it('should call throw an error if no siblings found', function (done) {
        const newJob = Object.assign({}, testData, {
          parsedCompose: {
            results: [
              Object.assign({}, testSibling1, { metadata: { isMain: true } })
            ]
          }
        })
        Worker.task(newJob).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.be.an.instanceOf(WorkerStopError)
          expect(err.message).to.equal('Job has no siblings instances')
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
          sinon.assert.calledTwice(rabbitMQ.createClusterSiblingInstance)
          const basePayload = pick(testData, ['cluster', 'sessionUserBigPoppaId', 'organization', 'triggeredAction', 'repoFullName'])
          const job1 = Object.assign({ parsedComposeSiblingData: testSibling1 }, basePayload)
          const job2 = Object.assign({ parsedComposeSiblingData: testSibling2 }, basePayload)
          sinon.assert.calledWithExactly(rabbitMQ.createClusterSiblingInstance, job1)
          sinon.assert.calledWithExactly(rabbitMQ.createClusterSiblingInstance, job2)
          done()
        })
      })
    })
  })
})
