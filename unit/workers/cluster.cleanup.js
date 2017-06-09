/**
 * @module unit/workers/cluster.cleanup
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
const sinon = require('sinon')
require('sinon-as-promised')(Promise)

const logger = require('logger')
const joi = require('utils/joi')
const Instance = require('models/mongo/instance')
const ClusterDataService = require('models/services/cluster-data-service')
const rabbitMQ = require('models/rabbitmq')
const WorkerStopError = require('error-cat/errors/worker-stop-error')
const Worker = require('workers/cluster.cleanup')

describe('Cluster Cleanup Worker', () => {
  describe('worker', () => {
    const testData = {
      githubId: 999999,
      clusterName: 'Henry\'s-Cluster'
    }
    const mockInstance1 = {
      _id: 'l33t h4x',
      name: 'Henry\'s-Cluster-main',
      shortName: 'main'
    }

    const mockInstance2 = {
      _id: 'h0m3gr0wn',
      name: 'Henry\'s-Cluster-db',
      shortName: 'db'
    }

    beforeEach((done) => {
      sinon.stub(Promise, 'delay').resolves()
      sinon.stub(Instance, 'aggregateAsync').resolves([
        mockInstance1,
        mockInstance2
      ])
      sinon.stub(ClusterDataService, 'populateInstanceWithClusterInfo').resolves([
        Object.assign(mockInstance1, { inputClusterConfig: false }),
        Object.assign(mockInstance2, { inputClusterConfig: false }),
      ])
      sinon.stub(rabbitMQ, 'deleteInstance').resolves()
      done()
    })

    afterEach((done) => {
      Promise.delay.restore()
      Instance.aggregateAsync.restore()
      ClusterDataService.populateInstanceWithClusterInfo.restore()
      rabbitMQ.deleteInstance.restore()
      done()
    })

    describe('success', () => {
      it('should return no error', (done) => {
        Worker.task(testData).asCallback(done)
      })

      it('should call ClusterDataService.populateInstanceWithClusterInfo', (done) => {
        Worker.task(testData).asCallback((err) => {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(ClusterDataService.populateInstanceWithClusterInfo)
          sinon.assert.calledWithExactly(ClusterDataService.populateInstanceWithClusterInfo, [ mockInstance1, mockInstance2 ])
          done()
        })
      })

      it('should call rabbitMQ.deleteInstances', (done) => {
        Worker.task(testData).asCallback((err) => {
          expect(err).to.not.exist()
          sinon.assert.calledTwice(rabbitMQ.deleteInstance)
          sinon.assert.calledWithExactly(rabbitMQ.deleteInstance, { instanceId: mockInstance1._id })
          sinon.assert.calledWithExactly(rabbitMQ.deleteInstance, { instanceId: mockInstance2._id })
          done()
        })
      })
    })

    describe('ignoring good cluster instances', () => {
      beforeEach((done) => {
        ClusterDataService.populateInstanceWithClusterInfo.restore()
        sinon.stub(ClusterDataService, 'populateInstanceWithClusterInfo').resolves([
          Object.assign(mockInstance1, {inputClusterConfig: true}),
          Object.assign(mockInstance2, {inputClusterConfig: true}),
        ])
        done()
      })

      it('should not call rabbitMQ.deleteInstances', (done) => {
        Worker.task(testData).asCallback((err) => {
          expect(err).to.not.exist()
          sinon.assert.notCalled(rabbitMQ.deleteInstance)
          done()
        })
      })
    })

    describe('errors', function () {
      it('should reject with a worker stop error', function (done) {
        ClusterDataService.populateInstanceWithClusterInfo.rejects(new Error(''))
        Worker.task(testData).asCallback((err) => {
          expect(err).to.exist()
          expect(err).to.be.an.instanceof(WorkerStopError)
          done()
        })
      })
    })
  })
})
