'use strict'

const Lab = require('lab')
const lab = exports.lab = Lab.script()
const describe = lab.describe
const it = lab.it
const before = lab.before
const beforeEach = lab.beforeEach
const after = lab.after
const afterEach = lab.afterEach
const Code = require('code')
const expect = Code.expect

const objectId = require('objectid')
const InputClusterConfig = require('models/mongo/input-cluster-config')
const mongooseControl = require('models/mongo/mongoose-control')

describe('InputClusterConfig Model Integration Tests', function () {
  const autoIsolationConfigId = '507f191e810c19729de860ea'
  const data = {
    filePath: '/config/compose.yml',
    autoIsolationConfigId: objectId(autoIsolationConfigId),
    createdByUser: 123123,
    ownedByOrg: 1
  }
  before(mongooseControl.start)
  afterEach(function (done) {
    InputClusterConfig.remove({}, done)
  })

  after(mongooseControl.stop)

  describe('save input cluster config', function () {
    it('should be possible to save input cluster config', function (done) {
      InputClusterConfig.createAsync(data)
      .tap(function (saved) {
        expect(saved.filePath).to.equal(data.filePath)
        expect(saved.created).to.exist()
        expect(saved.createdByUser).to.equal(data.createdByUser)
        expect(saved.ownerBy).to.equal(data.ownerBy)
      })
      .asCallback(done)
    })
  })

  describe('markAsDeleted', function () {
    let savedInputClusterConfig = null
    beforeEach(function (done) {
      InputClusterConfig.createAsync(data)
      .tap(function (saved) {
        expect(saved.filePath).to.equal(data.filePath)
        expect(saved.autoIsolationConfigId.toString()).to.equal(data.autoIsolationConfigId.toString())
        expect(saved.created).to.exist()
        expect(saved.deleted).to.not.exist()
        savedInputClusterConfig = saved
      }).asCallback(done)
    })

    it('should be able to mark config as deleted', function (done) {
      InputClusterConfig.markAsDeleted(savedInputClusterConfig._id)
      .then(() => {
        return InputClusterConfig.findOneAsync({ autoIsolationConfigId: objectId(savedInputClusterConfig.autoIsolationConfigId) })
      })
      .tap((config) => {
        expect(config.deleted).to.exist()
        expect(config).to.exist()
      })
      .asCallback(done)
    })
  })

  describe('validation', function () {
    it('should fail if filePath is not provided', function (done) {
      const invalidData = Object.assign({}, data)
      invalidData.filePath = null
      InputClusterConfig.createAsync(invalidData).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.errors.filePath.message).to.equal('Input Cluster Config requires file path')
        done()
      })
    })

    it('should fail if createdByUser is not valid', function (done) {
      const invalidValue = 'some-invalid-value'
      const invalidData = Object.assign({}, data)
      invalidData.createdByUser = invalidValue
      InputClusterConfig.createAsync(invalidData).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal(`Cast to number failed for value "${invalidValue}" at path "createdByUser"`)
        done()
      })
    })
    it('should fail if ownedByOrg is not valid', function (done) {
      const invalidValue = 'some-invalid-value'
      const invalidData = Object.assign({}, data)
      invalidData.ownedByOrg = invalidValue
      InputClusterConfig.createAsync(invalidData).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal(`Cast to number failed for value "${invalidValue}" at path "ownedByOrg"`)
        done()
      })
    })

    it('should fail if autoIsolationConfigId is not provided', function (done) {
      const invalidData = Object.assign({}, data)
      invalidData.autoIsolationConfigId = null
      InputClusterConfig.createAsync(invalidData).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.errors.autoIsolationConfigId.message).to.equal('Input Cluster Config requires AutoIsolationConfig id')
        done()
      })
    })

    it('should fail if autoIsolationConfigId is not valid object id', function (done) {
      const invalidId = 'some-invalid-id'
      const invalidData = Object.assign({}, data)
      invalidData.autoIsolationConfigId = invalidId
      InputClusterConfig.createAsync(invalidData).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal(`Cast to ObjectId failed for value "${invalidId}" at path "autoIsolationConfigId"`)
        done()
      })
    })
  })
})
