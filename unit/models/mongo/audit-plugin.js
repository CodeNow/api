'use strict'

const Code = require('code')
const Lab = require('lab')
const Promise = require('bluebird')
const sinon = require('sinon')
const objectId = require('objectid')
const AutoIsolationConfig = require('models/mongo/auto-isolation-config')

require('sinon-as-promised')(Promise)
const lab = exports.lab = Lab.script()

const afterEach = lab.afterEach
const beforeEach = lab.beforeEach
const describe = lab.describe
const expect = Code.expect
const it = lab.it

describe('Audit Plugin Model Tests', function () {
  describe('markAsDeleted', function () {
    const configId = '507f1f77bcf86cd799439011'
    const mockConfig = {
      _id: configId
    }

    beforeEach(function (done) {
      sinon.stub(AutoIsolationConfig, 'findOneAndUpdateAsync').resolves(mockConfig)
      done()
    })

    afterEach(function (done) {
      AutoIsolationConfig.findOneAndUpdateAsync.restore()
      done()
    })

    it('should call findOneAndUpdateAsync', function (done) {
      AutoIsolationConfig.markAsDeleted(configId)
        .tap(function (cluster) {
          expect(cluster).to.equal(mockConfig)
          const query = {
            _id: objectId(configId),
            deleted: {
              $exists: false
            }
          }
          const updates = {
            $set: {
              deleted: sinon.match.number
            }
          }
          sinon.assert.calledOnce(AutoIsolationConfig.findOneAndUpdateAsync)
          sinon.assert.calledWithExactly(AutoIsolationConfig.findOneAndUpdateAsync, query, updates, { new: true })
        })
        .asCallback(done)
    })

    it('should return an error if mongo call failed', function (done) {
      const mongoError = new Error('Mongo error')
      AutoIsolationConfig.findOneAndUpdateAsync.rejects(mongoError)
      AutoIsolationConfig.markAsDeleted(configId)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(mongoError.message)
          done()
        })
    })
  })
  describe('findOneActive', function () {
    const configId = '507f1f77bcf86cd799439011'
    const instanceId = '607f1f77bcf86cd799439012'
    const mockConfig = {
      _id: configId,
      instanceId: instanceId
    }

    beforeEach(function (done) {
      sinon.stub(AutoIsolationConfig, 'findOneAsync').resolves(mockConfig)
      done()
    })

    afterEach(function (done) {
      AutoIsolationConfig.findOneAsync.restore()
      done()
    })

    it('should call findOneAsync', function (done) {
      AutoIsolationConfig.findOneActive({ _id: objectId(configId) })
        .tap(function (cluster) {
          expect(cluster).to.equal(mockConfig)
          sinon.assert.calledOnce(AutoIsolationConfig.findOneAsync)
          sinon.assert.calledWithExactly(AutoIsolationConfig.findOneAsync, {
            _id: objectId(configId),
            deleted: {
              $exists: false
            }
          })
        })
        .asCallback(done)
    })

    it('should return NotFound error if config wasn\'t found', function (done) {
      AutoIsolationConfig.findOneAsync.resolves(null)
      AutoIsolationConfig.findOneActive(configId)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.be.an.instanceOf(AutoIsolationConfig.NotFoundError)
          expect(err.message).to.equal('AutoIsolationConfig not found')
          done()
        })
    })

    it('should return an error if mongo call failed', function (done) {
      const mongoError = new Error('Mongo error')
      AutoIsolationConfig.findOneAsync.rejects(mongoError)
      AutoIsolationConfig.findOneActive(configId)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(mongoError.message)
          done()
        })
    })
  })
  describe('findByIdAndAssert', function () {
    const configId = '507f1f77bcf86cd799439011'
    const mockConfig = {
      _id: configId
    }

    beforeEach(function (done) {
      sinon.stub(AutoIsolationConfig, 'findOneActive').resolves(mockConfig)
      done()
    })

    afterEach(function (done) {
      AutoIsolationConfig.findOneActive.restore()
      done()
    })

    it('should call findOneActive', function (done) {
      AutoIsolationConfig.findByIdAndAssert(configId)
        .tap(function (cluster) {
          expect(cluster).to.equal(mockConfig)
          sinon.assert.calledOnce(AutoIsolationConfig.findOneActive)
          sinon.assert.calledWithExactly(AutoIsolationConfig.findOneActive, {
            _id: objectId(configId)
          })
        })
        .asCallback(done)
    })

    it('should return an error if mongo call failed', function (done) {
      const mongoError = new Error('Mongo error')
      AutoIsolationConfig.findOneActive.rejects(mongoError)
      AutoIsolationConfig.findByIdAndAssert(configId)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(mongoError.message)
          done()
        })
    })
  })
})
