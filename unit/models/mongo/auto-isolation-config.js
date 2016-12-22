'use strict'

const Code = require('code')
const Lab = require('lab')
const Promise = require('bluebird')
const sinon = require('sinon')
const AutoIsolationConfig = require('models/mongo/auto-isolation-config')

require('sinon-as-promised')(Promise)
const lab = exports.lab = Lab.script()

const describe = lab.describe
const expect = Code.expect
const it = lab.it

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
  })
})
