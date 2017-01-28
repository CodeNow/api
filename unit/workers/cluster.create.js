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

const ClusterConfigService = require('models/services/cluster-config-service')
const UserService = require('models/services/user-service')
const Worker = require('workers/cluster.create')

describe('Cluster Create Worker', function () {
  describe('worker', function () {
    const testData = {
      sessionUserGithubId: 123,
      triggeredAction: 'user',
      repoFullName: 'Runnable/api',
      branchName: 'feature-1',
      filePath: 'compose.yml',
      isTesting: true,
      newInstanceName: 'api'
    }
    const sessionUser = {
      _id: 'some-id'
    }
    beforeEach(function (done) {
      sinon.stub(ClusterConfigService, 'create').resolves()
      sinon.stub(UserService, 'getCompleteUserByBigPoppaId').resolves(sessionUser)
      done()
    })

    afterEach(function (done) {
      ClusterConfigService.create.restore()
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
      it('should reject with any ClusterConfigService.create error', function (done) {
        const mongoError = new Error('Mongo failed')
        ClusterConfigService.create.rejects(mongoError)
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.exist()
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

      it('should call create cluster', function (done) {
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(ClusterConfigService.create)
          const data = Object.assign({}, testData)
          delete data.sessionUserGithubId
          sinon.assert.calledWithExactly(ClusterConfigService.create, sessionUser, data)
          done()
        })
      })

      it('should call functions in order', function (done) {
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.callOrder(
            UserService.getCompleteUserByBigPoppaId,
            ClusterConfigService.create
          )
          done()
        })
      })
    })
  })
})
