/**
 * @module unit/workers/instance.deleted
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

const objectId = require('objectid')

const DockerComposeCluster = require('models/mongo/docker-compose-cluster')
const InstanceService = require('models/services/instance-service')
const IsolationService = require('models/services/isolation-service')
const rabbitMQ = require('models/rabbitmq')

const Worker = require('workers/instance.deleted')

describe('Instance Deleted Worker', function () {
  describe('worker', function () {
    const testJob = {
      instance: {
        _id: 'some-id'
      }
    }
    beforeEach(function (done) {
      sinon.stub(Worker, '_deleteCluster').resolves()
      sinon.stub(Worker, '_deleteIsolation').resolves()
      sinon.stub(Worker, '_deleteForks').resolves()
      done()
    })

    afterEach(function (done) {
      Worker._deleteCluster.restore()
      Worker._deleteIsolation.restore()
      Worker._deleteForks.restore()
      done()
    })

    describe('errors', function () {
      it('should reject with any _deleteCluster error', function (done) {
        const deleteError = new Error('Delete failed')
        Worker._deleteCluster.rejects(deleteError)
        Worker.task(testJob).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(deleteError)
          sinon.assert.calledOnce(Worker._deleteCluster)
          sinon.assert.calledOnce(Worker._deleteIsolation)
          sinon.assert.calledOnce(Worker._deleteForks)
          done()
        })
      })
      it('should reject with any _deleteIsolation error', function (done) {
        const deleteError = new Error('Delete failed')
        Worker._deleteIsolation.rejects(deleteError)
        Worker.task(testJob).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(deleteError)
          sinon.assert.calledOnce(Worker._deleteCluster)
          sinon.assert.calledOnce(Worker._deleteIsolation)
          sinon.assert.calledOnce(Worker._deleteForks)
          done()
        })
      })
      it('should reject with any _deleteForks error', function (done) {
        const deleteError = new Error('Delete failed')
        Worker._deleteForks.rejects(deleteError)
        Worker.task(testJob).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(deleteError)
          sinon.assert.calledOnce(Worker._deleteCluster)
          sinon.assert.calledOnce(Worker._deleteIsolation)
          sinon.assert.calledOnce(Worker._deleteForks)
          done()
        })
      })
    })

    it('should return no error', function (done) {
      Worker.task(testJob).asCallback(done)
    })

    it('should call _deleteCluster with correct args', function (done) {
      Worker.task(testJob)
      .tap(function () {
        sinon.assert.calledOnce(Worker._deleteCluster)
        sinon.assert.calledWithExactly(Worker._deleteCluster, testJob)
      })
      .asCallback(done)
    })

    it('should call _deleteIsolation with correct args', function (done) {
      Worker.task(testJob)
      .tap(function () {
        sinon.assert.calledOnce(Worker._deleteIsolation)
        sinon.assert.calledWithExactly(Worker._deleteIsolation, testJob)
      })
      .asCallback(done)
    })

    it('should call _deleteForks with correct args', function (done) {
      Worker.task(testJob)
      .tap(function () {
        sinon.assert.calledOnce(Worker._deleteForks)
        sinon.assert.calledWithExactly(Worker._deleteForks, testJob)
      })
      .asCallback(done)
    })
  })

  describe('_deleteCluster', function () {
    const clusterId = objectId('407f191e810c19729de860ef')
    const testJob = {
      instance: {
        _id: 'some-id'
      }
    }
    const testCluster = {
      _id: clusterId
    }
    beforeEach(function (done) {
      sinon.stub(DockerComposeCluster, 'findActiveByParentId').resolves(testCluster)
      sinon.stub(rabbitMQ, 'deleteCluster').returns()
      done()
    })

    afterEach(function (done) {
      DockerComposeCluster.findActiveByParentId.restore()
      rabbitMQ.deleteCluster.restore()
      done()
    })
    describe('errors', function () {
      it('should reject if findActiveByParentId failed', function (done) {
        const error = new Error('Error')
        DockerComposeCluster.findActiveByParentId.rejects(error)
        Worker._deleteCluster(testJob)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })

      it('should reject if deleteCluster published failed', function (done) {
        const error = new Error('Error')
        rabbitMQ.deleteCluster.throws(error)
        Worker._deleteCluster(testJob)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })
    })
    describe('success', function () {
      it('should work without error', function (done) {
        Worker._deleteCluster(testJob).asCallback(done)
      })

      it('should call findActiveByParentId with correct args', function (done) {
        Worker._deleteCluster(testJob)
        .tap(function () {
          sinon.assert.calledOnce(DockerComposeCluster.findActiveByParentId)
          sinon.assert.calledWithExactly(DockerComposeCluster.findActiveByParentId, testJob.instance._id)
        })
        .asCallback(done)
      })

      it('should call deleteCluster with correct args', function (done) {
        Worker._deleteCluster(testJob)
        .tap(function () {
          sinon.assert.calledOnce(rabbitMQ.deleteCluster)
          const id = clusterId.toString()
          sinon.assert.calledWithExactly(rabbitMQ.deleteCluster, { id })
        })
        .asCallback(done)
      })

      it('should call functions in order', function (done) {
        Worker._deleteCluster(testJob)
        .tap(function () {
          sinon.assert.callOrder(
            DockerComposeCluster.findActiveByParentId,
            rabbitMQ.deleteCluster
          )
        })
        .asCallback(done)
      })
    })
  })

  describe('_deleteIsolation', function () {
    const testJob = {
      instance: {
        _id: 'some-id',
        isolated: objectId('407f191e810c19729de860ef'),
        isIsolationGroupMaster: true
      }
    }
    beforeEach(function (done) {
      sinon.stub(IsolationService, 'deleteIsolatedChildren').resolves()
      done()
    })

    afterEach(function (done) {
      IsolationService.deleteIsolatedChildren.restore()
      done()
    })
    describe('errors', function () {
      it('should reject if deleteIsolatedChildren failed', function (done) {
        const error = new Error('Error')
        IsolationService.deleteIsolatedChildren.rejects(error)
        Worker._deleteIsolation(testJob)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })
    })
    describe('success', function () {
      it('should work without error', function (done) {
        Worker._deleteIsolation(testJob).asCallback(done)
      })

      it('should call deleteIsolatedChildren with correct args', function (done) {
        Worker._deleteIsolation(testJob)
        .tap(function () {
          sinon.assert.calledOnce(IsolationService.deleteIsolatedChildren)
          sinon.assert.calledWithExactly(IsolationService.deleteIsolatedChildren, testJob.instance.isolated)
        })
        .asCallback(done)
      })

      it('should not call deleteIsolatedChildren if non isolation master', function (done) {
        const newJob = Object.assign({}, testJob)
        newJob.instance.isIsolationGroupMaster = false
        Worker._deleteIsolation(newJob)
        .tap(function () {
          sinon.assert.notCalled(IsolationService.deleteIsolatedChildren)
        })
        .asCallback(done)
      })

      it('should not call deleteIsolatedChildren if non isolated', function (done) {
        const newJob = Object.assign({}, testJob)
        newJob.instance.isolated = null
        Worker._deleteIsolation(newJob)
        .tap(function () {
          sinon.assert.notCalled(IsolationService.deleteIsolatedChildren)
        })
        .asCallback(done)
      })
    })
  })
})
