'use strict'

const Code = require('code')
const Lab = require('lab')
const Promise = require('bluebird')
const sinon = require('sinon')
const objectId = require('objectid')
const DockerComposeCluster = require('models/mongo/docker-compose-cluster')

require('sinon-as-promised')(Promise)
const lab = exports.lab = Lab.script()

const afterEach = lab.afterEach
const beforeEach = lab.beforeEach
const describe = lab.describe
const expect = Code.expect
const it = lab.it

describe('Docker Compose Cluster Model Tests', function () {
  describe('markAsDeleted', function () {
    const clusterId = '507f1f77bcf86cd799439011'
    const mockCluster = {
      _id: clusterId
    }

    beforeEach(function (done) {
      sinon.stub(DockerComposeCluster, 'findOneAndUpdateAsync').resolves(mockCluster)
      done()
    })

    afterEach(function (done) {
      DockerComposeCluster.findOneAndUpdateAsync.restore()
      done()
    })

    it('should call DockerComposeCluster.findOneAndUpdateAsync', function (done) {
      DockerComposeCluster.markAsDeleted(clusterId)
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
        sinon.assert.calledOnce(DockerComposeCluster.findOneAndUpdateAsync)
        sinon.assert.calledWithExactly(DockerComposeCluster.findOneAndUpdateAsync, query, updates)
      })
      .asCallback(done)
    })

    it('should return an error if mongo call failed', function (done) {
      const mongoError = new Error('Mongo error')
      DockerComposeCluster.findOneAndUpdateAsync.rejects(mongoError)
      DockerComposeCluster.markAsDeleted(clusterId)
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
      sinon.stub(DockerComposeCluster, 'findByIdAsync').resolves(mockCluster)
      done()
    })

    afterEach(function (done) {
      DockerComposeCluster.findByIdAsync.restore()
      done()
    })

    it('should call DockerComposeCluster.findByIdAsync', function (done) {
      DockerComposeCluster.findByIdAndAssert(clusterId)
      .tap(function (cluster) {
        expect(cluster).to.equal(mockCluster)
        sinon.assert.calledOnce(DockerComposeCluster.findByIdAsync)
        sinon.assert.calledWithExactly(DockerComposeCluster.findByIdAsync, clusterId)
      })
      .asCallback(done)
    })

    it('should return NotFound error if cluster wasn\'t found', function (done) {
      DockerComposeCluster.findByIdAsync.resolves(null)
      DockerComposeCluster.findByIdAndAssert(clusterId)
      .asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.an.instanceOf(DockerComposeCluster.NotFoundError)
        expect(err.message).to.equal('DockerComposeCluster not found')
        done()
      })
    })

    it('should return an error if mongo call failed', function (done) {
      const mongoError = new Error('Mongo error')
      DockerComposeCluster.findByIdAsync.rejects(mongoError)
      DockerComposeCluster.findByIdAndAssert(clusterId)
      .asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal(mongoError.message)
        done()
      })
    })
  })
  describe('findActiveByParentId', function () {
    const clusterId = '507f1f77bcf86cd799439011'
    const parentInstanceId = '607f1f77bcf86cd799439012'
    const mockCluster = {
      _id: clusterId,
      parentInstanceId: parentInstanceId
    }

    beforeEach(function (done) {
      sinon.stub(DockerComposeCluster, 'findOneAsync').resolves(mockCluster)
      done()
    })

    afterEach(function (done) {
      DockerComposeCluster.findOneAsync.restore()
      done()
    })

    it('should call DockerComposeCluster.findOneAsync', function (done) {
      DockerComposeCluster.findActiveByParentId(parentInstanceId)
      .tap(function (cluster) {
        expect(cluster).to.equal(mockCluster)
        const query = {
          parentInstanceId: objectId(parentInstanceId),
          deleted: {
            $exists: false
          }
        }
        sinon.assert.calledOnce(DockerComposeCluster.findOneAsync)
        sinon.assert.calledWithExactly(DockerComposeCluster.findOneAsync, query)
      })
      .asCallback(done)
    })

    it('should return NotFound error if cluster wasn\'t found', function (done) {
      DockerComposeCluster.findOneAsync.resolves(null)
      DockerComposeCluster.findActiveByParentId(parentInstanceId)
      .asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.an.instanceOf(DockerComposeCluster.NotFoundError)
        expect(err.message).to.equal('DockerComposeCluster not found')
        done()
      })
    })

    it('should return an error if mongo call failed', function (done) {
      const mongoError = new Error('Mongo error')
      DockerComposeCluster.findOneAsync.rejects(mongoError)
      DockerComposeCluster.findActiveByParentId(parentInstanceId)
      .asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal(mongoError.message)
        done()
      })
    })
  })
})
