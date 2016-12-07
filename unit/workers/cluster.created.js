/**
 * @module unit/workers/cluster.created
 */
'use strict'

const Lab = require('lab')
const lab = exports.lab = Lab.script()

const afterEach = lab.afterEach
const beforeEach = lab.beforeEach
const describe = lab.describe
const expect = require('code').expect
const it = lab.it

const Promise = require('bluebird')
const sinon = require('sinon')
require('sinon-as-promised')(Promise)

const DockerComposeClusterService = require('models/services/docker-compose-cluster-service')
const objectid = require('objectid')
const rabbitMQ = require('models/rabbitmq')
const UserService = require('models/services/user-service')
const Worker = require('workers/cluster.created')

describe('Cluster Created Worker', function () {
  describe('worker', function () {
    const instance = {
      _id: objectid('5568f58160e9990d009c9429')
    }
    const mainInstanceDef = {
      metadata: {
        name: 'api',
        isMain: true
      }
    }
    const testData = {
      cluster: {
        id: '1111'
      },

      parsedCompose: {
        results: [mainInstanceDef]
      },
      sessionUserBigPoppaId: 12,
      orgBigPoppaId: 101,
      triggeredAction: 'user',
      repoFullName: 'Runnable/api'
    }
    const sessionUser = {
      _id: 'some-id'
    }
    beforeEach(function (done) {
      sinon.stub(DockerComposeClusterService, 'createClusterParent').resolves(instance)
      sinon.stub(UserService, 'getCompleteUserByBigPoppaId').resolves(sessionUser)
      sinon.stub(rabbitMQ, 'clusterParentInstanceCreated').returns()
      done()
    })

    afterEach(function (done) {
      DockerComposeClusterService.createClusterParent.restore()
      UserService.getCompleteUserByBigPoppaId.restore()
      rabbitMQ.clusterParentInstanceCreated.restore()
      done()
    })

    describe('errors', function () {
      it('should reject with any UserService.getCompleteUserByBigPoppaId error', function (done) {
        const mongoError = new Error('Mongo failed')
        UserService.getCompleteUserByBigPoppaId.rejects(mongoError)
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(mongoError)
          done()
        })
      })
      it('should reject with any DockerComposeClusterService.createClusterParent error', function (done) {
        const mongoError = new Error('Mongo failed')
        DockerComposeClusterService.createClusterParent.rejects(mongoError)
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(mongoError)
          done()
        })
      })
    })

    it('should return no error', function (done) {
      Worker.task(testData).asCallback(done)
    })

    it('should find an user by bigPoppaId', function (done) {
      Worker.task(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(UserService.getCompleteUserByBigPoppaId)
        sinon.assert.calledWithExactly(UserService.getCompleteUserByBigPoppaId, testData.sessionUserBigPoppaId)
        done()
      })
    })

    it('should call create cluster parent', function (done) {
      Worker.task(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(DockerComposeClusterService.createClusterParent)
        sinon.assert.calledWithExactly(DockerComposeClusterService.createClusterParent,
          sessionUser,
          mainInstanceDef,
          testData.repoFullName,
          testData.triggeredAction)
        done()
      })
    })

    it('should call rabbit publish', function (done) {
      Worker.task(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        const newJob = Object.assign({}, testData)
        newJob.instance = {
          id: instance._id.toString()
        }
        sinon.assert.calledOnce(rabbitMQ.clusterParentInstanceCreated)
        sinon.assert.calledWithExactly(rabbitMQ.clusterParentInstanceCreated, newJob)
        done()
      })
    })

    it('should call functions in order', function (done) {
      Worker.task(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.callOrder(
          UserService.getCompleteUserByBigPoppaId,
          DockerComposeClusterService.createClusterParent,
          rabbitMQ.clusterParentInstanceCreated
        )
        done()
      })
    })
  })
})
