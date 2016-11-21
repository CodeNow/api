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
    parentInstance: objectId('507f191e810c19729de860ea'),
    siblings: [
      objectId('607f191e810c19729de860eb'),
      objectId('707f191e810c19729de860ec')
    ]
  }
  before(mongooseControl.start)
  afterEach(function (done) {
    DockerComposeCluster.remove({}, done)
  })

  after(function (done) {
    DockerComposeCluster.remove({}, done)
  })
  after(mongooseControl.stop)

  describe('find by parentInstance', function () {
    let savedDockerComposeCluster = null
    before(function (done) {
      const composeCluster = new DockerComposeCluster(data)
      composeCluster.saveAsync()
      .tap(function (saved) {
        expect(saved.dockerComposeFilePath).to.equal(data.dockerComposeFilePath)
        expect(saved.parentInstance.toString()).to.equal(data.parentInstance.toString())
        expect(saved.siblings.length).to.equal(data.siblings.length)
        expect(saved.siblings[0].toString()).to.equal(data.siblings[0].toString())
        expect(saved.siblings[1].toString()).to.equal(data.siblings[1].toString())
        expect(saved.created).to.exist()
        savedDockerComposeCluster = saved
      }).asCallback(done)
    })

    it('should be possible to find settings by parentInstance id', function (done) {
      DockerComposeCluster.findOneAsync({ 'parentInstance': objectId('507f191e810c19729de860ea') })
      .tap(function (composeCluster) {
        expect(String(composeCluster._id)).to.equal(String(savedDockerComposeCluster._id))
        expect(composeCluster.dockerComposeFilePath).to.equal(savedDockerComposeCluster.dockerComposeFilePath)
        expect(composeCluster.parentInstance.toString()).to.equal(savedDockerComposeCluster.parentInstance.toString())
        expect(composeCluster.siblings.length).to.equal(savedDockerComposeCluster.siblings.length)
        expect(composeCluster.created).to.equal(savedDockerComposeCluster.created)
      })
      .asCallback(done)
    })
  })

  describe('save compose cluster', function () {
    it('should be possible to save compose cluster', function (done) {
      const data = {
        dockerComposeFilePath: '/config/compose.yml',
        parentInstance: objectId('507f191e810c19729de860ea'),
        siblings: [
          objectId('607f191e810c19729de860eb'),
          objectId('707f191e810c19729de860ec')
        ]
      }
      const composeCluster = new DockerComposeCluster(data)
      composeCluster.saveAsync()
      .tap(function (saved) {
        expect(saved.dockerComposeFilePath).to.equal(data.dockerComposeFilePath)
        expect(saved.parentInstance.toString()).to.equal(data.parentInstance.toString())
        expect(saved.siblings.length).to.equal(data.siblings.length)
        expect(saved.siblings[0].toString()).to.equal(data.siblings[0].toString())
        expect(saved.siblings[1].toString()).to.equal(data.siblings[1].toString())
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
      composeCluster.saveAsync()
      .then(function () {
        done(new Error('Should fail'))
      })
      .catch(function (err) {
        expect(err.errors.dockerComposeFilePath.message).to.equal('Docker Compose Cluser requires compose file path')
        done()
      })
    })

    it('should fail if parentInstance is not provided', function (done) {
      const invalidData = Object.assign({}, data)
      invalidData.parentInstance = null
      const composeCluster = new DockerComposeCluster(invalidData)
      composeCluster.saveAsync()
      .then(function () {
        done(new Error('Should fail'))
      })
      .catch(function (err) {
        expect(err.errors.parentInstance.message).to.equal('Docker Compose Cluser requires parent instance')
        done()
      })
    })

    it('should fail if parentInstance is not valid object id', function (done) {
      const invalidData = Object.assign({}, data)
      invalidData.parentInstance = 'some-invalid-id'
      const composeCluster = new DockerComposeCluster(invalidData)
      composeCluster.saveAsync()
      .then(function () {
        done(new Error('Should fail'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('Cast to ObjectId failed for value "some-invalid-id" at path "parentInstance"')
        done()
      })
    })

    it('should fail if siblings are not valid objectid', function (done) {
      const invalidData = Object.assign({}, data)
      invalidData.siblings.push('some-invalid-id')
      const composeCluster = new DockerComposeCluster(invalidData)
      composeCluster.saveAsync()
      .then(function () {
        done(new Error('Should fail'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('Cast to ObjectId failed for value "607f191e810c19729de860eb,707f191e810c19729de860ec,some-invalid-id" at path "siblings"')
        done()
      })
    })
  })
})
