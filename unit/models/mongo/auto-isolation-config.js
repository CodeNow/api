'use strict'

const Code = require('code')
const Lab = require('lab')
const objectId = require('objectid')
const Promise = require('bluebird')
const sinon = require('sinon')
const AutoIsolationConfig = require('models/mongo/auto-isolation-config')

require('sinon-as-promised')(Promise)
const lab = exports.lab = Lab.script()

const describe = lab.describe
const expect = Code.expect
const it = lab.it
const afterEach = lab.afterEach
const beforeEach = lab.beforeEach

describe('Auto Isolation Config Model Tests', function () {
  describe('should have auditPlugin', () => {
    it('should have function markAsDeleted', (done) => {
      expect(AutoIsolationConfig.markAsDeleted).to.exist()
      done()
    })
    it('should have function findByIdAndAssert', (done) => {
      expect(AutoIsolationConfig.findByIdAndAssert).to.exist()
      done()
    })
    it('should have function findOneActive', (done) => {
      expect(AutoIsolationConfig.findOneActive).to.exist()
      done()
    })
    it('should have function findAllActive', (done) => {
      expect(AutoIsolationConfig.findAllActive).to.exist()
      done()
    })
    it('should have function assertFound', (done) => {
      expect(AutoIsolationConfig.assertFound).to.exist()
      done()
    })
  })

  describe('findActiveByInstanceId', () => {
    const modelId = '507f1f77bcf86cd799439011'
    const model = {
      _id: modelId
    }
    beforeEach((done) => {
      sinon.stub(AutoIsolationConfig, 'findOneActive').resolves(model)
      done()
    })
    afterEach((done) => {
      AutoIsolationConfig.findOneActive.restore()
      done()
    })
    it('should fail if findOneActive failed', (done) => {
      const error = new Error('Some error')
      AutoIsolationConfig.findOneActive.rejects(error)
      AutoIsolationConfig.findActiveByInstanceId(modelId)
        .asCallback((err) => {
          expect(err).to.exist()
          expect(err.message).to.exist(error.message)
          done()
        })
    })

    it('should call findOneActive with correct args', (done) => {
      AutoIsolationConfig.findActiveByInstanceId(modelId)
        .tap((config) => {
          expect(config).to.equal(model)
          sinon.assert.calledOnce(AutoIsolationConfig.findOneActive)
          const query = {
            instance: objectId(modelId)
          }
          sinon.assert.calledWithExactly(AutoIsolationConfig.findOneActive, query)
        })
        .asCallback(done)
    })

    it('should throw no error', (done) => {
      AutoIsolationConfig.findActiveByInstanceId(modelId)
        .asCallback(done)
    })
  })

  describe('findActiveByAnyInstanceId', () => {
    const modelId = '507f1f77bcf86cd799439011'
    const model = {
      _id: modelId
    }
    beforeEach((done) => {
      sinon.stub(AutoIsolationConfig, 'findOneActive').resolves(model)
      done()
    })
    afterEach((done) => {
      AutoIsolationConfig.findOneActive.restore()
      done()
    })
    it('should fail if findOneActive failed', (done) => {
      const error = new Error('Some error')
      AutoIsolationConfig.findOneActive.rejects(error)
      AutoIsolationConfig.findActiveByAnyInstanceId(modelId)
        .asCallback((err) => {
          expect(err).to.exist()
          expect(err.message).to.exist(error.message)
          done()
        })
    })

    it('should call findOneActive with correct args', (done) => {
      AutoIsolationConfig.findActiveByAnyInstanceId(modelId)
        .tap((config) => {
          expect(config).to.equal(model)
          sinon.assert.calledOnce(AutoIsolationConfig.findOneActive)
          const query = {
            $or: [
              {
                instance: objectId(modelId)
              },
              {
                requestedDependencies: {
                  $elemMatch: {
                    instance: objectId(modelId)
                  }
                }
              }
            ]
          }
          sinon.assert.calledWithExactly(AutoIsolationConfig.findOneActive, query)
        })
        .asCallback(done)
    })

    it('should throw no error', (done) => {
      AutoIsolationConfig.findActiveByAnyInstanceId(modelId)
        .asCallback(done)
    })
  })

  describe('updateAutoIsolationDependencies', () => {
    const modelId = '507f1f77bcf86cd799439011'
    const model = {
      _id: modelId
    }
    const requestedDeps = [
      { instance: 'asdasdasdasd' }
    ]
    beforeEach((done) => {
      sinon.stub(AutoIsolationConfig, 'updateAsync').resolves(model)
      done()
    })
    afterEach((done) => {
      AutoIsolationConfig.updateAsync.restore()
      done()
    })
    it('should fail if findOneActive failed', (done) => {
      const error = new Error('Some error')
      AutoIsolationConfig.updateAsync.rejects(error)
      AutoIsolationConfig.updateAutoIsolationDependencies(modelId, requestedDeps)
        .asCallback((err) => {
          expect(err).to.exist()
          expect(err.message).to.exist(error.message)
          done()
        })
    })

    it('should call findOneActive with correct args', (done) => {
      AutoIsolationConfig.updateAutoIsolationDependencies(modelId, requestedDeps)
        .tap((config) => {
          expect(config).to.equal(model)
          sinon.assert.calledOnce(AutoIsolationConfig.updateAsync)
          const query = {
            instance: objectId(modelId),
            deleted: {
              $exists: false
            }
          }
          const $set = {
            requestedDependencies: requestedDeps
          }
          sinon.assert.calledWithExactly(
            AutoIsolationConfig.updateAsync,
            query,
            $set
          )
        })
        .asCallback(done)
    })

    it('should throw no error', (done) => {
      AutoIsolationConfig.updateAutoIsolationDependencies(modelId, requestedDeps)
        .asCallback(done)
    })
  })
})
