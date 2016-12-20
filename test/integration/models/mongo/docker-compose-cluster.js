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
  const autoIsolationConfigId = '507f191e810c19729de860ea'
  const data = {
    dockerComposeFilePath: '/config/compose.yml',
    autoIsolationConfigId: objectId(autoIsolationConfigId),
    createdByUser: 123123,
    ownedByOrg: 1
  }
  before(mongooseControl.start)
  afterEach(function (done) {
    DockerComposeConfig.remove({}, done)
  })

  after(mongooseControl.stop)

  describe('save compose config', function () {
    it('should be possible to save compose cluster', function (done) {
      const composeConfig = new DockerComposeConfig(data)
      composeConfig.saveAsync()
      .tap(function (saved) {
        expect(saved.dockerComposeFilePath).to.equal(data.dockerComposeFilePath)
        expect(saved.created).to.exist()
        expect(saved.createdByUser).to.equal(data.createdByUser)
        expect(saved.ownerBy).to.equal(data.ownerBy)
      })
      .asCallback(done)
    })
  })

  // describe('markAsDeleted', function () {
  //   let savedDockerComposeConfig = null
  //   beforeEach(function (done) {
  //     const composeConfig = new DockerComposeConfig(data)
  //     composeConfig.saveAsync()
  //     .tap(function (saved) {
  //       expect(saved.dockerComposeFilePath).to.equal(data.dockerComposeFilePath)
  //       expect(saved.autoIsolationConfigId.toString()).to.equal(data.autoIsolationConfigId.toString())
  //       expect(saved.created).to.exist()
  //       expect(saved.deleted).to.not.exist()
  //       savedDockerComposeConfig = saved
  //     }).asCallback(done)
  //   })
  //
  //   it('should be able to mark config as deleted', function (done) {
  //     DockerComposeConfig.markAsDeleted(savedDockerComposeConfig._id)
  //     .then(function () {
  //       return DockerComposeConfig.findOneAsync({ autoIsolationConfigId: objectId(savedDockerComposeConfig.autoIsolationConfigId) })
  //     })
  //     .tap(function (clusterModel) {
  //       expect(clusterModel).to.exist()
  //     })
  //     .then(function () {
  //       return DockerComposeConfig.findActiveByParentId(savedDockerComposeConfig.autoIsolationConfigId)
  //     })
  //     .asCallback(function (err) {
  //       expect(err).to.exist()
  //       expect(err.message).to.equal('DockerComposeConfig not found')
  //       expect(err).to.be.an.instanceOf(DockerComposeConfig.NotFoundError)
  //       done()
  //     })
  //   })
  // })

  describe('validation', function () {
    it('should fail if dockerComposeFilePath is not provided', function (done) {
      const invalidData = Object.assign({}, data)
      invalidData.dockerComposeFilePath = null
      const composeConfig = new DockerComposeConfig(invalidData)
      composeConfig.saveAsync().asCallback(function (err) {
        expect(err).to.exist()
        expect(err.errors.dockerComposeFilePath.message).to.equal('Docker Compose Cluster requires compose file path')
        done()
      })
    })

    it('should fail if createdByUser is not provided', function (done) {
      const invalidData = Object.assign({}, data)
      invalidData.createdByUser = null
      const composeConfig = new DockerComposeConfig(invalidData)
      composeConfig.saveAsync().asCallback(function (err) {
        expect(err).to.exist()
        expect(err.errors.createdByUser.message).to.equal('Docker Compose Cluster requires createdByUser')
        done()
      })
    })

    it('should fail if ownedByOrg is not provided', function (done) {
      const invalidData = Object.assign({}, data)
      invalidData.ownedByOrg = null
      const composeConfig = new DockerComposeConfig(invalidData)
      composeConfig.saveAsync().asCallback(function (err) {
        expect(err).to.exist()
        expect(err.errors.ownedByOrg.message).to.equal('Docker Compose Cluster requires ownedByOrg')
        done()
      })
    })

    it('should fail if autoIsolationConfigId is not valid object id', function (done) {
      const invalidId = 'some-invalid-id'
      const invalidData = Object.assign({}, data)
      invalidData.autoIsolationConfigId = invalidId
      const composeConfig = new DockerComposeConfig(invalidData)
      composeConfig.saveAsync().asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal(`Cast to ObjectId failed for value "${invalidId}" at path "autoIsolationConfigId"`)
        done()
      })
    })
  })
})
