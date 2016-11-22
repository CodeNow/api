'use strict'

const Lab = require('lab')
const lab = exports.lab = Lab.script()
const describe = lab.describe
const it = lab.it
const before = lab.before
const after = lab.after
const afterEach = lab.afterEach
const Code = require('code')
const expect = Code.expect

const objectId = require('objectid')
const DockerComposeCluster = require('models/mongo/docker-compose-cluster')
const mongooseControl = require('models/mongo/mongoose-control')

describe('DockerComposeCluster Model Integration Tests', function () {
  const data = {
    dockerComposeFilePath: '/config/compose.yml',
    parentInstaneId: objectId('507f191e810c19729de860ea'),
    siblingsInstanceIds: [
      objectId('607f191e810c19729de860eb'),
      objectId('707f191e810c19729de860ec')
    ]
  }
  before(mongooseControl.start)
  afterEach(function (done) {
    DockerComposeCluster.remove({}, done)
  })

  after(mongooseControl.stop)

  describe('find by parent instance', function () {
    let savedDockerComposeCluster = null
    before(function (done) {
      const composeCluster = new DockerComposeCluster(data)
      composeCluster.saveAsync()
      .tap(function (saved) {
        expect(saved.dockerComposeFilePath).to.equal(data.dockerComposeFilePath)
        expect(saved.parentInstaneId.toString()).to.equal(data.parentInstaneId.toString())
        expect(saved.siblingsInstanceIds.length).to.equal(data.siblingsInstanceIds.length)
        expect(saved.siblingsInstanceIds[0].toString()).to.equal(data.siblingsInstanceIds[0].toString())
        expect(saved.siblingsInstanceIds[1].toString()).to.equal(data.siblingsInstanceIds[1].toString())
        expect(saved.created).to.exist()
        savedDockerComposeCluster = saved
      }).asCallback(done)
    })

    it('should be possible to find compose cluster by parent id', function (done) {
      DockerComposeCluster.findOneAsync({ 'parentInstaneId': objectId('507f191e810c19729de860ea') })
      .tap(function (composeCluster) {
        expect(String(composeCluster._id)).to.equal(String(savedDockerComposeCluster._id))
        expect(composeCluster.dockerComposeFilePath).to.equal(savedDockerComposeCluster.dockerComposeFilePath)
        expect(composeCluster.parentInstaneId.toString()).to.equal(savedDockerComposeCluster.parentInstaneId.toString())
        expect(composeCluster.siblingsInstanceIds.length).to.equal(savedDockerComposeCluster.siblingsInstanceIds.length)
        expect(composeCluster.created).to.equal(savedDockerComposeCluster.created)
      })
      .asCallback(done)
    })
  })

  describe('save compose cluster', function () {
    it('should be possible to save compose cluster', function (done) {
      const data = {
        dockerComposeFilePath: '/config/compose.yml',
        parentInstaneId: objectId('507f191e810c19729de860ea'),
        siblingsInstanceIds: [
          objectId('607f191e810c19729de860eb'),
          objectId('707f191e810c19729de860ec')
        ]
      }
      const composeCluster = new DockerComposeCluster(data)
      composeCluster.saveAsync()
      .tap(function (saved) {
        expect(saved.dockerComposeFilePath).to.equal(data.dockerComposeFilePath)
        expect(saved.parentInstaneId.toString()).to.equal(data.parentInstaneId.toString())
        expect(saved.siblingsInstanceIds.length).to.equal(data.siblingsInstanceIds.length)
        expect(saved.siblingsInstanceIds[0].toString()).to.equal(data.siblingsInstanceIds[0].toString())
        expect(saved.siblingsInstanceIds[1].toString()).to.equal(data.siblingsInstanceIds[1].toString())
        expect(saved.created).to.exist()
      })
      .asCallback(done)
    })
  })

  describe('validation', function () {
    it('should fail if dockerComposeFilePath is not provided', function (done) {
      const invalidData = Object.assign({}, data)
      invalidData.dockerComposeFilePath = null
      const composeCluster = new DockerComposeCluster(invalidData)
      composeCluster.saveAsync().asCallback(function (err) {
        expect(err).to.exist()
        expect(err.errors.dockerComposeFilePath.message).to.equal('Docker Compose Cluser requires compose file path')
        done()
      })
    })

    it('should fail if parent id is not provided', function (done) {
      const invalidData = Object.assign({}, data)
      invalidData.parentInstaneId = null
      const composeCluster = new DockerComposeCluster(invalidData)
      composeCluster.saveAsync().asCallback(function (err) {
        expect(err).to.exist()
        expect(err.errors.parentInstaneId.message).to.equal('Docker Compose Cluser requires parent instance id')
        done()
      })
    })

    it('should fail if parent id is not valid object id', function (done) {
      const invalidId = 'some-invalid-id'
      const invalidData = Object.assign({}, data)
      invalidData.parentInstaneId = invalidId
      const composeCluster = new DockerComposeCluster(invalidData)
      composeCluster.saveAsync().asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal(`Cast to ObjectId failed for value "${invalidId}" at path "parentInstaneId"`)
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
