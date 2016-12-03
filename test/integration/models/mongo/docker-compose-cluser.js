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
const DockerComposeCluster = require('models/mongo/docker-compose-cluster')
const mongooseControl = require('models/mongo/mongoose-control')

describe('DockerComposeCluster Model Integration Tests', function () {
  const parentInstanceId = '507f191e810c19729de860ea'
  const data = {
    dockerComposeFilePath: '/config/compose.yml',
    parentInstanceId: objectId(parentInstanceId),
    siblingsInstanceIds: [
      objectId('607f191e810c19729de860eb'),
      objectId('707f191e810c19729de860ec')
    ],
    createdBy: 123123,
    ownedBy: 1,
    triggeredAction: 'user'
  }
  before(mongooseControl.start)
  afterEach(function (done) {
    DockerComposeCluster.remove({}, done)
  })

  after(mongooseControl.stop)

  describe('find by parent instance', function () {
    let savedDockerComposeCluster = null
    beforeEach(function (done) {
      const composeCluster = new DockerComposeCluster(data)
      composeCluster.saveAsync()
      .tap(function (saved) {
        expect(saved.dockerComposeFilePath).to.equal(data.dockerComposeFilePath)
        expect(saved.parentInstanceId.toString()).to.equal(data.parentInstanceId.toString())
        expect(saved.siblingsInstanceIds.length).to.equal(data.siblingsInstanceIds.length)
        expect(saved.siblingsInstanceIds[0].toString()).to.equal(data.siblingsInstanceIds[0].toString())
        expect(saved.siblingsInstanceIds[1].toString()).to.equal(data.siblingsInstanceIds[1].toString())
        expect(saved.created).to.exist()
        expect(saved.deleted).to.not.exist()
        expect(saved.ownerBy).to.equal(data.ownerBy)
        savedDockerComposeCluster = saved
      }).asCallback(done)
    })

    it('should be possible to find compose cluster by parent id', function (done) {
      DockerComposeCluster.findOneAsync({ parentInstanceId: objectId(parentInstanceId) })
      .tap(function (composeCluster) {
        expect(String(composeCluster._id)).to.equal(String(savedDockerComposeCluster._id))
        expect(composeCluster.dockerComposeFilePath).to.equal(savedDockerComposeCluster.dockerComposeFilePath)
        expect(composeCluster.parentInstanceId.toString()).to.equal(savedDockerComposeCluster.parentInstanceId.toString())
        expect(composeCluster.siblingsInstanceIds.length).to.equal(savedDockerComposeCluster.siblingsInstanceIds.length)
        expect(composeCluster.created).to.equal(savedDockerComposeCluster.created)
        expect(composeCluster.deleted).to.not.exist()
        expect(composeCluster.ownerBy).to.equal(data.ownerBy)
      })
      .asCallback(done)
    })

    it('should be possible to find compose cluster by calling findActiveByParentId', function (done) {
      DockerComposeCluster.findActiveByParentId(parentInstanceId)
      .tap(function (composeCluster) {
        expect(String(composeCluster._id)).to.equal(String(savedDockerComposeCluster._id))
        expect(composeCluster.dockerComposeFilePath).to.equal(savedDockerComposeCluster.dockerComposeFilePath)
        expect(composeCluster.parentInstanceId.toString()).to.equal(savedDockerComposeCluster.parentInstanceId.toString())
        expect(composeCluster.siblingsInstanceIds.length).to.equal(savedDockerComposeCluster.siblingsInstanceIds.length)
        expect(composeCluster.created).to.equal(savedDockerComposeCluster.created)
        expect(composeCluster.deleted).to.not.exist()
        expect(composeCluster.ownerBy).to.equal(data.ownerBy)
      })
      .asCallback(done)
    })

    it('should return NotFound if findActiveByParentId was called with cluster that doesn\'t exist', function (done) {
      DockerComposeCluster.findActiveByParentId('107f191e810c19729de860ea')
      .asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal('DockerComposeCluster not found')
        expect(err).to.be.an.instanceOf(DockerComposeCluster.NotFoundError)
        done()
      })
    })
  })

  describe('save compose cluster', function () {
    it('should be possible to save compose cluster', function (done) {
      const data = {
        dockerComposeFilePath: '/config/compose.yml',
        parentInstanceId: objectId(parentInstanceId),
        siblingsInstanceIds: [
          objectId('607f191e810c19729de860eb'),
          objectId('707f191e810c19729de860ec')
        ],
        createdBy: 123123,
        ownedBy: 2,
        triggeredAction: 'user'
      }
      const composeCluster = new DockerComposeCluster(data)
      composeCluster.saveAsync()
      .tap(function (saved) {
        expect(saved.dockerComposeFilePath).to.equal(data.dockerComposeFilePath)
        expect(saved.parentInstanceId.toString()).to.equal(data.parentInstanceId.toString())
        expect(saved.siblingsInstanceIds.length).to.equal(data.siblingsInstanceIds.length)
        expect(saved.siblingsInstanceIds[0].toString()).to.equal(data.siblingsInstanceIds[0].toString())
        expect(saved.siblingsInstanceIds[1].toString()).to.equal(data.siblingsInstanceIds[1].toString())
        expect(saved.created).to.exist()
        expect(saved.createdBy).to.equal(data.createdBy)
        expect(saved.triggeredAction).to.equal(data.triggeredAction)
        expect(saved.ownerBy).to.equal(data.ownerBy)
      })
      .asCallback(done)
    })
  })

  describe('markAsDeleted', function () {
    let savedDockerComposeCluster = null
    beforeEach(function (done) {
      const composeCluster = new DockerComposeCluster(data)
      composeCluster.saveAsync()
      .tap(function (saved) {
        expect(saved.dockerComposeFilePath).to.equal(data.dockerComposeFilePath)
        expect(saved.parentInstanceId.toString()).to.equal(data.parentInstanceId.toString())
        expect(saved.siblingsInstanceIds.length).to.equal(data.siblingsInstanceIds.length)
        expect(saved.siblingsInstanceIds[0].toString()).to.equal(data.siblingsInstanceIds[0].toString())
        expect(saved.siblingsInstanceIds[1].toString()).to.equal(data.siblingsInstanceIds[1].toString())
        expect(saved.created).to.exist()
        expect(saved.deleted).to.not.exist()
        savedDockerComposeCluster = saved
      }).asCallback(done)
    })

    it('should be able to mark instance as deleted', function (done) {
      DockerComposeCluster.markAsDeleted(savedDockerComposeCluster._id)
      .then(function () {
        return DockerComposeCluster.findOneAsync({ parentInstanceId: objectId(savedDockerComposeCluster.parentInstanceId) })
      })
      .tap(function (clusterModel) {
        expect(clusterModel).to.exist()
      })
      .then(function () {
        return DockerComposeCluster.findActiveByParentId(savedDockerComposeCluster.parentInstanceId)
      })
      .asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal('DockerComposeCluster not found')
        expect(err).to.be.an.instanceOf(DockerComposeCluster.NotFoundError)
        done()
      })
    })
  })

  describe('validation', function () {
    it('should fail if dockerComposeFilePath is not provided', function (done) {
      const invalidData = Object.assign({}, data)
      invalidData.dockerComposeFilePath = null
      const composeCluster = new DockerComposeCluster(invalidData)
      composeCluster.saveAsync().asCallback(function (err) {
        expect(err).to.exist()
        expect(err.errors.dockerComposeFilePath.message).to.equal('Docker Compose Cluster requires compose file path')
        done()
      })
    })

    it('should fail if createdBy is not provided', function (done) {
      const invalidData = Object.assign({}, data)
      invalidData.createdBy = null
      const composeCluster = new DockerComposeCluster(invalidData)
      composeCluster.saveAsync().asCallback(function (err) {
        expect(err).to.exist()
        expect(err.errors.createdBy.message).to.equal('Docker Compose Cluster requires createdBy')
        done()
      })
    })

    it('should fail if triggeredAction is not provided', function (done) {
      const invalidData = Object.assign({}, data)
      invalidData.triggeredAction = null
      const composeCluster = new DockerComposeCluster(invalidData)
      composeCluster.saveAsync().asCallback(function (err) {
        expect(err).to.exist()
        expect(err.errors.triggeredAction.message).to.equal('Docker Compose Cluster requires triggeredAction')
        done()
      })
    })

    it('should fail if ownedBy is not provided', function (done) {
      const invalidData = Object.assign({}, data)
      invalidData.ownedBy = null
      const composeCluster = new DockerComposeCluster(invalidData)
      composeCluster.saveAsync().asCallback(function (err) {
        expect(err).to.exist()
        expect(err.errors.ownedBy.message).to.equal('Docker Compose Cluster requires ownedBy')
        done()
      })
    })

    it('should fail if parent id is not valid object id', function (done) {
      const invalidId = 'some-invalid-id'
      const invalidData = Object.assign({}, data)
      invalidData.parentInstanceId = invalidId
      const composeCluster = new DockerComposeCluster(invalidData)
      composeCluster.saveAsync().asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal(`Cast to ObjectId failed for value "${invalidId}" at path "parentInstanceId"`)
        done()
      })
    })

    it('should fail if siblingsInstanceIds are not valid objectid', function (done) {
      const invalidId = 'some-invalid-id'
      const invalidData = Object.assign({}, data)
      invalidData.siblingsInstanceIds = [ invalidId ]
      const composeCluster = new DockerComposeCluster(invalidData)
      composeCluster.saveAsync().asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal(`Cast to ObjectId failed for value "${invalidId}" at path "siblingsInstanceIds"`)
        done()
      })
    })
  })
})
