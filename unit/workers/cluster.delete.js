/**
 * @module unit/workers/cluster.delete
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
const Worker = require('workers/cluster.delete')

describe('Cluster Delete Worker', function () {
  describe('worker', function () {
    const testData = {
      cluster: {
        id: 'some-id'
      }
    }
    beforeEach(function (done) {
      sinon.stub(ClusterConfigService, 'delete').resolves()
      done()
    })

    afterEach(function (done) {
      ClusterConfigService.delete.restore()
      done()
    })

    describe('errors', function () {
      it('should reject with any ClusterConfigService.delete error', function (done) {
        const mongoError = new Error('Mongo failed')
        ClusterConfigService.delete.rejects(mongoError)
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.exist()
          done()
        })
      })
    })

    describe('success', function () {
      it('should return no error', function (done) {
        Worker.task(testData).asCallback(done)
      })

      it('should call ClusterConfigService.delete', function (done) {
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(ClusterConfigService.delete)
          sinon.assert.calledWithExactly(ClusterConfigService.delete, testData.cluster.id)
          done()
        })
      })
    })
  })
})
