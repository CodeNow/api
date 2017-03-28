'use strict'

const Code = require('code')
const Lab = require('lab')
const Promise = require('bluebird')
const InputClusterConfig = require('models/mongo/input-cluster-config')

require('sinon-as-promised')(Promise)
const lab = exports.lab = Lab.script()

const describe = lab.describe
const expect = Code.expect
const it = lab.it

describe('Input Cluster Config Model Tests', () => {
  describe('should have auditPlugin', () => {
    it('should have function markAsDeleted', (done) => {
      expect(InputClusterConfig.markAsDeleted).to.exist()
      done()
    })
    it('should have function findByIdAndAssert', (done) => {
      expect(InputClusterConfig.findByIdAndAssert).to.exist()
      done()
    })
    it('should have function findOneActive', (done) => {
      expect(InputClusterConfig.findOneActive).to.exist()
      done()
    })
    it('should have function findAllActive', (done) => {
      expect(InputClusterConfig.findAllActive).to.exist()
      done()
    })
    it('should have function assertFound', (done) => {
      expect(InputClusterConfig.assertFound).to.exist()
      done()
    })
  })
})
