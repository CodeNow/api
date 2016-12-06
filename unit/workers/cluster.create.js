/**
 * @module unit/workers/cluster.create
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
const UserService = require('models/services/user-service')
const Worker = require('workers/cluster.create')

describe('Cluster Create Worker', function () {
  describe('worker', function () {
    const testData = {
      sessionUserGithubId: 123,
      triggeredAction: 'user',
      repoFullName: 'Runnable/api',
      branchName: 'feature-1',
      dockerComposeFilePath: 'compose.yml',
      newInstanceName: 'api'
    }
    const sessionUser = {
      _id: 'some-id'
    }
    beforeEach(function (done) {
      sinon.stub(DockerComposeClusterService, 'create').resolves()
      sinon.stub(UserService, 'getCompleteUserByBigPoppaId').resolves(sessionUser)
      done()
    })

    afterEach(function (done) {
      DockerComposeClusterService.create.restore()
      UserService.getCompleteUserByBigPoppaId.restore()
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
      it('should reject with any DockerComposeClusterService.create error', function (done) {
        const mongoError = new Error('Mongo failed')
        DockerComposeClusterService.create.rejects(mongoError)
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

    it('should call create cluster', function (done) {
      Worker.task(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(DockerComposeClusterService.create)
        sinon.assert.calledWithExactly(DockerComposeClusterService.create,
          sessionUser,
          testData.triggeredAction,
          testData.repoFullName,
          testData.branchName, testData.dockerComposeFilePath, testData.newInstanceName)
        done()
      })
    })

    it('should call functions in order', function (done) {
      Worker.task(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.callOrder(
          UserService.getCompleteUserByBigPoppaId,
          DockerComposeClusterService.create
        )
        done()
      })
    })
  })
})