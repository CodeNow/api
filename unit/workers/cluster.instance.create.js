/**
 * @module unit/workers/cluster.instance.create
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
const objectid = require('objectid')
const sinon = require('sinon')
require('sinon-as-promised')(Promise)

const DockerComposeCluster = require('models/mongo/docker-compose-cluster')
const DockerComposeClusterService = require('models/services/docker-compose-cluster-service')
const rabbitMQ = require('models/rabbitmq')
const UserService = require('models/services/user-service')
const Worker = require('workers/cluster.instance.create')

describe('Cluster Instance Create Worker', function () {
  describe('worker', function () {
    const testClusterId = '7768f58160e9990d009c9428'
    const testOrgBigPoppaId = 20001
    const testOrgGithubId = 213123
    const testData = {
      cluster: {
        id: testClusterId
      },
      parsedComposeSiInsanceta: {
        contextVersion: {
          advanced: true
        },
        instance: {
          name: 'db'
        }
      },
      sessionUserGithubId: 123,
      triggeredAction: 'user',
      repoFullName: 'Runnable/api',
      organization: {
        id: testOrgBigPoppaId
      }
    }
    const testSessionUser = {
      _id: 'some-id',
      bigPoppaUser: {
        organizations: [{
          id: testOrgBigPoppaId,
          githubId: testOrgGithubId,
          lowerName: 'runnable'
        }]
      }
    }
    const testInstance = {
      _id: objectid('5568f58160e9990d009c9429')
    }
    const testCluster = {
      _id: objectid(testClusterId)
    }
    beforeEach(function (done) {
      sinon.stub(UserService, 'getCompleteUserByBigPoppaId').resolves(testSessionUser)
      sinon.stub(DockerComposeClusterService, 'createClusterInstance').resolves(testInstance)
      sinon.stub(DockerComposeCluster, 'findOneAndUpdateAsync').resolves(testCluster)
      sinon.stub(rabbitMQ, 'clusterInstanceCreated').returns()
      done()
    })

    afterEach(function (done) {
      UserService.getCompleteUserByBigPoppaId.restore()
      DockerComposeClusterService.createClusterInstance.restore()
      DockerComposeCluster.findOneAndUpdateAsync.restore()
      rabbitMQ.clusterInstanceCreated.restore()
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
      it('should reject with any DockerComposeClusterService.createClusterInstance error', function (done) {
        const mongoError = new Error('Mongo failed')
        DockerComposeClusterService.createClusterInstance.rejects(mongoError)
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(mongoError)
          done()
        })
      })
      it('should reject with any DockerComposeCluster.findOneAndUpdateAsync error', function (done) {
        const mongoError = new Error('Mongo failed')
        DockerComposeCluster.findOneAndUpdateAsync.rejects(mongoError)
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(mongoError)
          done()
        })
      })
      it('should reject with rabbit failure error', function (done) {
        const rabbitError = new Error('Rabbit failed')
        rabbitMQ.clusterInstanceCreated.throws(rabbitError)
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(rabbitError)
          done()
        })
      })
    })

    describe('success', function () {
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

      it('should call create cluster instance', function (done) {
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.not.exist()
          const orgInfo = {
            bigPoppaOrgId: testOrgBigPoppaId,
            githubOrgId: testOrgGithubId
          }
          sinon.assert.calledOnce(DockerComposeClusterService.createClusterInstance)
          sinon.assert.calledWithExactly(DockerComposeClusterService.createClusterInstance,
            testSessionUser,
            testData.parsedComposeInsanceData,
            orgInfo,
            testData.triggeredAction)
          done()
        })
      })

      it('should call update cluster', function (done) {
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(DockerComposeCluster.findOneAndUpdateAsync)
          const query = {
            _id: testClusterId
          }
          const updateQuery = {
            $push: {
              instancesIds: testInstance._id
            }
          }
          sinon.assert.calledWithExactly(DockerComposeCluster.findOneAndUpdateAsync, query, updateQuery)
          done()
        })
      })

      it('should call rabbit publish event', function (done) {
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(rabbitMQ.clusterInstanceCreated)
          const newJob = Object.assign({}, testData, { instance: { id: testInstance._id.toString() } })
          sinon.assert.calledWithExactly(rabbitMQ.clusterInstanceCreated, newJob)
          done()
        })
      })

      it('should call functions in order', function (done) {
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.callOrder(
            UserService.getCompleteUserByBigPoppaId,
            DockerComposeClusterService.createClusterInstance,
            DockerComposeCluster.findOneAndUpdateAsync,
            rabbitMQ.clusterInstanceCreated
          )
          done()
        })
      })
    })
  })
})
