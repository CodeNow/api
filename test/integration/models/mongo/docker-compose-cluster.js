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
const DockerComposeConfig = require('models/mongo/docker-compose-config')
const mongooseControl = require('models/mongo/mongoose-control')

describe('DockerComposeConfig Model Integration Tests', function () {
  const parentInstanceId = '507f191e810c19729de860ea'
  const data = {
    dockerComposeFilePath: '/config/compose.yml',
    parentInstanceId: objectId(parentInstanceId),
    instancesIds: [
      objectId('607f191e810c19729de860eb'),
      objectId('707f191e810c19729de860ec')
    ],
    createdByUser: 123123,
    ownedByOrg: 1
  }
  before(mongooseControl.start)
  afterEach(function (done) {
    DockerComposeConfig.remove({}, done)
  })

  after(mongooseControl.stop)

  describe('find by parent instance', function () {
    let savedDockerComposeConfig = null
    beforeEach(function (done) {
      const composeCluster = new DockerComposeConfig(data)
      composeCluster.saveAsync()
      .tap(function (saved) {
        expect(saved.dockerComposeFilePath).to.equal(data.dockerComposeFilePath)
        expect(saved.parentInstanceId.toString()).to.equal(data.parentInstanceId.toString())
        expect(saved.instancesIds.length).to.equal(data.instancesIds.length)
        expect(saved.instancesIds[0].toString()).to.equal(data.instancesIds[0].toString())
        expect(saved.instancesIds[1].toString()).to.equal(data.instancesIds[1].toString())
        expect(saved.created).to.exist()
        expect(saved.deleted).to.not.exist()
        expect(saved.ownerBy).to.equal(data.ownerBy)
        savedDockerComposeConfig = saved
      }).asCallback(done)
    })

    it('should be possible to find compose cluster by parent id', function (done) {
      DockerComposeConfig.findOneAsync({ parentInstanceId: objectId(parentInstanceId) })
      .tap(function (composeCluster) {
        expect(String(composeCluster._id)).to.equal(String(savedDockerComposeConfig._id))
        expect(composeCluster.dockerComposeFilePath).to.equal(savedDockerComposeConfig.dockerComposeFilePath)
        expect(composeCluster.parentInstanceId.toString()).to.equal(savedDockerComposeConfig.parentInstanceId.toString())
        expect(composeCluster.instancesIds.length).to.equal(savedDockerComposeConfig.instancesIds.length)
        expect(composeCluster.created).to.equal(savedDockerComposeConfig.created)
        expect(composeCluster.deleted).to.not.exist()
        expect(composeCluster.ownerBy).to.equal(data.ownerBy)
      })
      .asCallback(done)
    })
  })

  describe('save compose cluster', function () {
    it('should be possible to save compose cluster', function (done) {
      const data = {
        dockerComposeFilePath: '/config/compose.yml',
        parentInstanceId: objectId(parentInstanceId),
        instancesIds: [
          objectId('607f191e810c19729de860eb'),
          objectId('707f191e810c19729de860ec')
        ],
        createdByUser: 123123,
        ownedByOrg: 2
      }
      const composeCluster = new DockerComposeConfig(data)
      composeCluster.saveAsync()
      .tap(function (saved) {
        expect(saved.dockerComposeFilePath).to.equal(data.dockerComposeFilePath)
        expect(saved.parentInstanceId.toString()).to.equal(data.parentInstanceId.toString())
        expect(saved.instancesIds.length).to.equal(data.instancesIds.length)
        expect(saved.instancesIds[0].toString()).to.equal(data.instancesIds[0].toString())
        expect(saved.instancesIds[1].toString()).to.equal(data.instancesIds[1].toString())
        expect(saved.created).to.exist()
        expect(saved.createdByUser).to.equal(data.createdByUser)
        expect(saved.ownerBy).to.equal(data.ownerBy)
      })
      .asCallback(done)
    })
  })

  describe('markAsDeleted', function () {
    let savedDockerComposeConfig = null
    beforeEach(function (done) {
      const composeCluster = new DockerComposeConfig(data)
      composeCluster.saveAsync()
      .tap(function (saved) {
        expect(saved.dockerComposeFilePath).to.equal(data.dockerComposeFilePath)
        expect(saved.parentInstanceId.toString()).to.equal(data.parentInstanceId.toString())
        expect(saved.instancesIds.length).to.equal(data.instancesIds.length)
        expect(saved.instancesIds[0].toString()).to.equal(data.instancesIds[0].toString())
        expect(saved.instancesIds[1].toString()).to.equal(data.instancesIds[1].toString())
        expect(saved.created).to.exist()
        expect(saved.deleted).to.not.exist()
        savedDockerComposeConfig = saved
      }).asCallback(done)
    })

    it('should be able to mark instance as deleted', function (done) {
      DockerComposeConfig.markAsDeleted(savedDockerComposeConfig._id)
      .then(function () {
        return DockerComposeConfig.findOneAsync({ parentInstanceId: objectId(savedDockerComposeConfig.parentInstanceId) })
      })
      .tap(function (clusterModel) {
        expect(clusterModel).to.exist()
      })
      .then(function () {
        return DockerComposeConfig.findActiveByParentId(savedDockerComposeConfig.parentInstanceId)
      })
      .asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal('DockerComposeConfig not found')
        expect(err).to.be.an.instanceOf(DockerComposeConfig.NotFoundError)
        done()
      })
    })
  })

  describe('validation', function () {
    it('should fail if dockerComposeFilePath is not provided', function (done) {
      const invalidData = Object.assign({}, data)
      invalidData.dockerComposeFilePath = null
      const composeCluster = new DockerComposeConfig(invalidData)
      composeCluster.saveAsync().asCallback(function (err) {
        expect(err).to.exist()
        expect(err.errors.dockerComposeFilePath.message).to.equal('Docker Compose Cluster requires compose file path')
        done()
      })
    })

    it('should fail if createdByUser is not provided', function (done) {
      const invalidData = Object.assign({}, data)
      invalidData.createdByUser = null
      const composeCluster = new DockerComposeConfig(invalidData)
      composeCluster.saveAsync().asCallback(function (err) {
        expect(err).to.exist()
        expect(err.errors.createdByUser.message).to.equal('Docker Compose Cluster requires createdByUser')
        done()
      })
    })

    it('should fail if ownedByOrg is not provided', function (done) {
      const invalidData = Object.assign({}, data)
      invalidData.ownedByOrg = null
      const composeCluster = new DockerComposeConfig(invalidData)
      composeCluster.saveAsync().asCallback(function (err) {
        expect(err).to.exist()
        expect(err.errors.ownedByOrg.message).to.equal('Docker Compose Cluster requires ownedByOrg')
        done()
      })
    })

    it('should fail if parent id is not valid object id', function (done) {
      const invalidId = 'some-invalid-id'
      const invalidData = Object.assign({}, data)
      invalidData.parentInstanceId = invalidId
      const composeCluster = new DockerComposeConfig(invalidData)
      composeCluster.saveAsync().asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal(`Cast to ObjectId failed for value "${invalidId}" at path "parentInstanceId"`)
        done()
      })
    })

    it('should fail if instancesIds are not valid objectid', function (done) {
      const invalidId = 'some-invalid-id'
      const invalidData = Object.assign({}, data)
      invalidData.instancesIds = [ invalidId ]
      const composeCluster = new DockerComposeConfig(invalidData)
      composeCluster.saveAsync().asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal(`Cast to ObjectId failed for value "${invalidId}" at path "instancesIds"`)
        done()
      })
    })
  })
})
