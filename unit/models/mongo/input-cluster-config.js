'use strict'

const Code = require('code')
const Lab = require('lab')
const Promise = require('bluebird')
const sinon = require('sinon')
const objectId = require('objectid')
const InputClusterConfig = require('models/mongo/input-cluster-config')

require('sinon-as-promised')(Promise)
const lab = exports.lab = Lab.script()

const afterEach = lab.afterEach
const beforeEach = lab.beforeEach
const describe = lab.describe
const expect = Code.expect
const it = lab.it

describe('Input Cluster Config Model Tests', function () {
  describe('markAsDeleted', function () {
    const clusterConfigId = '507f1f77bcf86cd799439011'
    const mockClusterConfig = {
      _id: clusterConfigId
    }

    beforeEach(function (done) {
      sinon.stub(InputClusterConfig, 'findOneAndUpdateAsync').resolves(mockClusterConfig)
      done()
    })

    afterEach(function (done) {
      InputClusterConfig.findOneAndUpdateAsync.restore()
      done()
    })

    it('should call InputClusterConfig.findOneAndUpdateAsync', function (done) {
      InputClusterConfig.markAsDeleted(clusterConfigId)
      .tap(function (cluster) {
        expect(cluster).to.equal(mockClusterConfig)
        const query = {
          _id: objectId(clusterConfigId),
          deleted: {
            $exists: false
          }
        }
        const updates = {
          $set: {
            deleted: sinon.match.number
          }
        }
        sinon.assert.calledOnce(InputClusterConfig.findOneAndUpdateAsync)
        sinon.assert.calledWithExactly(InputClusterConfig.findOneAndUpdateAsync, query, updates)
      })
      .asCallback(done)
    })

    it('should return an error if mongo call failed', function (done) {
      const mongoError = new Error('Mongo error')
      InputClusterConfig.findOneAndUpdateAsync.rejects(mongoError)
      InputClusterConfig.markAsDeleted(clusterConfigId)
      .asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal(mongoError.message)
        done()
      })
    })
  })
  describe('findByIdAndAssert', function () {
    const clusterConfigId = '507f1f77bcf86cd799439011'
    const mockClusterConfig = {
      _id: clusterConfigId
    }

    beforeEach(function (done) {
      sinon.stub(InputClusterConfig, 'findByIdAsync').resolves(mockClusterConfig)
      done()
    })

    afterEach(function (done) {
      InputClusterConfig.findByIdAsync.restore()
      done()
    })

    it('should call InputClusterConfig.findByIdAsync', function (done) {
      InputClusterConfig.findByIdAndAssert(clusterConfigId)
      .tap(function (clusterConfig) {
        expect(clusterConfig).to.equal(mockClusterConfig)
        sinon.assert.calledOnce(InputClusterConfig.findByIdAsync)
        sinon.assert.calledWithExactly(InputClusterConfig.findByIdAsync, clusterConfigId)
      })
      .asCallback(done)
    })

    it('should return NotFound error if config wasn\'t found', function (done) {
      InputClusterConfig.findByIdAsync.resolves(null)
      InputClusterConfig.findByIdAndAssert(clusterConfigId)
      .asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.an.instanceOf(InputClusterConfig.NotFoundError)
        expect(err.message).to.equal('InputClusterConfig not found')
        done()
      })
    })

    it('should return an error if mongo call failed', function (done) {
      const mongoError = new Error('Mongo error')
      InputClusterConfig.findByIdAsync.rejects(mongoError)
      InputClusterConfig.findByIdAndAssert(clusterConfigId)
      .asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal(mongoError.message)
        done()
      })
    })
  })
})
