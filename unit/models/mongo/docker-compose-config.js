'use strict'

const Code = require('code')
const Lab = require('lab')
const Promise = require('bluebird')
const sinon = require('sinon')
const objectId = require('objectid')
const DockerComposeConfig = require('models/mongo/docker-compose-config')

require('sinon-as-promised')(Promise)
const lab = exports.lab = Lab.script()

const afterEach = lab.afterEach
const beforeEach = lab.beforeEach
const describe = lab.describe
const expect = Code.expect
const it = lab.it

describe('Docker Compose Config Model Tests', function () {
  describe('markAsDeleted', function () {
    const clusterId = '507f1f77bcf86cd799439011'
    const mockCluster = {
      _id: clusterId
    }

    beforeEach(function (done) {
      sinon.stub(DockerComposeConfig, 'findOneAndUpdateAsync').resolves(mockCluster)
      done()
    })

    afterEach(function (done) {
      DockerComposeConfig.findOneAndUpdateAsync.restore()
      done()
    })

    it('should call DockerComposeConfig.findOneAndUpdateAsync', function (done) {
      DockerComposeConfig.markAsDeleted(clusterId)
      .tap(function (cluster) {
        expect(cluster).to.equal(mockCluster)
        const query = {
          _id: objectId(clusterId),
          deleted: {
            $exists: false
          }
        }
        const updates = {
          $set: {
            deleted: sinon.match.number
          }
        }
        sinon.assert.calledOnce(DockerComposeConfig.findOneAndUpdateAsync)
        sinon.assert.calledWithExactly(DockerComposeConfig.findOneAndUpdateAsync, query, updates)
      })
      .asCallback(done)
    })

    it('should return an error if mongo call failed', function (done) {
      const mongoError = new Error('Mongo error')
      DockerComposeConfig.findOneAndUpdateAsync.rejects(mongoError)
      DockerComposeConfig.markAsDeleted(clusterId)
      .asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal(mongoError.message)
        done()
      })
    })
  })
  describe('findByIdAndAssert', function () {
    const clusterId = '507f1f77bcf86cd799439011'
    const parentInstanceId = '607f1f77bcf86cd799439012'
    const mockCluster = {
      _id: clusterId,
      parentInstanceId: parentInstanceId
    }

    beforeEach(function (done) {
      sinon.stub(DockerComposeConfig, 'findByIdAsync').resolves(mockCluster)
      done()
    })

    afterEach(function (done) {
      DockerComposeConfig.findByIdAsync.restore()
      done()
    })

    it('should call DockerComposeConfig.findByIdAsync', function (done) {
      DockerComposeConfig.findByIdAndAssert(clusterId)
      .tap(function (cluster) {
        expect(cluster).to.equal(mockCluster)
        sinon.assert.calledOnce(DockerComposeConfig.findByIdAsync)
        sinon.assert.calledWithExactly(DockerComposeConfig.findByIdAsync, clusterId)
      })
      .asCallback(done)
    })

    it('should return NotFound error if cluster wasn\'t found', function (done) {
      DockerComposeConfig.findByIdAsync.resolves(null)
      DockerComposeConfig.findByIdAndAssert(clusterId)
      .asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.an.instanceOf(DockerComposeConfig.NotFoundError)
        expect(err.message).to.equal('DockerComposeConfig not found')
        done()
      })
    })

    it('should return an error if mongo call failed', function (done) {
      const mongoError = new Error('Mongo error')
      DockerComposeConfig.findByIdAsync.rejects(mongoError)
      DockerComposeConfig.findByIdAndAssert(clusterId)
      .asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal(mongoError.message)
        done()
      })
    })
  })
})
