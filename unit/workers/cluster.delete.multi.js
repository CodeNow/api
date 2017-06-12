/**
 * @module unit/workers/cluster.delete.multi
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

const ClusterConfigService = require('models/services/cluster-config-service')
const InputClusterConfig = require('models/mongo/input-cluster-config')
const Worker = require('workers/cluster.delete.multi')

describe('Cluster Delete Worker', function () {
  describe('worker', function () {
    const testData = {
      cluster: {
        id: 'some-id'
      }
    }

    const clusterWeb = {
      autoIsolationConfigId: 'another-id',
      clusterName: 'web',
      repo: 'web',
      branchName: 'master',
      files: ['./docker-compose.yml']
    }

    const clusterApi = {
      autoIsolationConfigId: 'and-yet-another-id',
      clusterName: 'api',
      repo: 'web',
      branchName: 'master',
      files: ['./docker-compose.yml']
    }

    beforeEach(function (done) {
      sinon.stub(InputClusterConfig, 'findByIdAndAssert').resolves(clusterWeb)
      sinon.stub(InputClusterConfig, 'findAllActive').resolves([clusterWeb, clusterApi])
      sinon.stub(ClusterConfigService, 'delete').resolves()
      done()
    })

    afterEach(function (done) {
      InputClusterConfig.findByIdAndAssert.restore()
      InputClusterConfig.findAllActive.restore()
      ClusterConfigService.delete.restore()
      done()
    })

    describe('errors', function () {
      it('should reject with any ClusterConfigService.delete error', function (done) {
        const mongoError = new Error('Mongo failed')
        ClusterConfigService.delete.rejects(mongoError)
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(mongoError)
          done()
        })
      })
    })

    describe('success', function () {
      it('should return no error', function (done) {
        Worker.task(testData).asCallback(done)
      })

      it('should call InputClusterConfig.deleteAllICC', function (done) {
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(InputClusterConfig.findByIdAndAssert)
          sinon.assert.calledWith(InputClusterConfig.findByIdAndAssert, testData.cluster.id)
          done()
        })
      })

      it('should call ClusterConfigService.delete on the right clusters', function (done) {
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledTwice(ClusterConfigService.delete)
          sinon.assert.calledWith(ClusterConfigService.delete, clusterWeb.autoIsolationConfigId)
          sinon.assert.calledWith(ClusterConfigService.delete, clusterApi.autoIsolationConfigId)
          done()
        })
      })
    })
  })
})
