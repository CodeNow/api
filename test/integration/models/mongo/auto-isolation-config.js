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
const AutoIsolationConfig = require('models/mongo/auto-isolation-config')
const mongooseControl = require('models/mongo/mongoose-control')

describe('AutoIsolationConfig Model Integration Tests', function () {
  const instanceId = objectId('507f191e810c19729de860ea')
  const requestedDependencies = [
    {
      instance: objectId('607f191e810c19729de860eb')
    },
    {
      instance: objectId('707f191e810c19729de860ec')
    }
  ]
  const data = {
    instance: instanceId,
    requestedDependencies,
    createdByUser: 123123,
    ownedByOrg: 1
  }
  before(mongooseControl.start)
  afterEach(function (done) {
    AutoIsolationConfig.remove({}, done)
  })

  after(mongooseControl.stop)

  describe('save auto-isolation config', function () {
    it('should be possible to save auto-isolation config', function (done) {
      AutoIsolationConfig.createAsync(data)
        .tap(function (saved) {
          expect(saved.instance).to.equal(data.instance)
          expect(saved.requestedDependencies.length).to.equal(2)
          expect(saved.createdByUser).to.equal(data.createdByUser)
          expect(saved.ownerBy).to.equal(data.ownerBy)
        })
        .asCallback(done)
    })
  })

  describe('markAsDeleted', function () {
    let savedAutoIsolationConfig = null
    beforeEach(function (done) {
      AutoIsolationConfig.createAsync(data)
        .tap(function (saved) {
          expect(saved.instance).to.equal(data.instance)
          expect(saved.requestedDependencies.length).to.equal(2)
          expect(saved.created).to.exist()
          expect(saved.deleted).to.not.exist()
          savedAutoIsolationConfig = saved
        }).asCallback(done)
    })

    it('should be able to mark config as deleted', function (done) {
      AutoIsolationConfig.markAsDeleted(savedAutoIsolationConfig._id)
        .then(() => {
          return AutoIsolationConfig.findOneAsync({ _id: savedAutoIsolationConfig._id })
        })
        .tap((config) => {
          expect(config.deleted).to.exist()
          expect(config).to.exist()
        })
        .asCallback(done)
    })
  })

  describe('validation', function () {
    it('should fail if createdByUser is not valid', function (done) {
      const invalidValue = 'some-invalid-value'
      const invalidData = Object.assign({}, data)
      invalidData.createdByUser = invalidValue
      AutoIsolationConfig.createAsync(invalidData).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal(`Cast to number failed for value "${invalidValue}" at path "createdByUser"`)
        done()
      })
    })
    it('should fail if ownedByOrg is not valid', function (done) {
      const invalidValue = 'some-invalid-value'
      const invalidData = Object.assign({}, data)
      invalidData.ownedByOrg = invalidValue
      AutoIsolationConfig.createAsync(invalidData).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal(`Cast to number failed for value "${invalidValue}" at path "ownedByOrg"`)
        done()
      })
    })


    it('should fail if instance is not valid object id', function (done) {
      const invalidId = 'some-invalid-id'
      const invalidData = Object.assign({}, data)
      invalidData.instance = invalidId
      AutoIsolationConfig.createAsync(invalidData).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal(`Cast to ObjectId failed for value "${invalidId}" at path "instance"`)
        done()
      })
    })
  })
})
