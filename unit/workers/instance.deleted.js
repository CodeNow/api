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

const DockerComposeConfig = require('models/mongo/docker-compose-config')
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
      sinon.stub(Worker, '_deleteIsolation').resolves()
      sinon.stub(Worker, '_deleteForks').resolves()
      done()
    })

    afterEach(function (done) {
      Worker._deleteIsolation.restore()
      Worker._deleteForks.restore()
      done()
    })

    describe('errors', function () {
      it('should reject with any _deleteIsolation error', function (done) {
        const deleteError = new Error('Delete failed')
        Worker._deleteIsolation.rejects(deleteError)
        Worker.task(testJob).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(deleteError)
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
          sinon.assert.calledOnce(Worker._deleteIsolation)
          sinon.assert.calledOnce(Worker._deleteForks)
          done()
        })
      })
    })

    it('should return no error', function (done) {
      Worker.task(testJob).asCallback(done)
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

  describe('_deleteForks', function () {
    const testJob = {
      instance: {
        _id: 'some-id'
      }
    }
    beforeEach(function (done) {
      sinon.stub(InstanceService, 'deleteAllInstanceForks').resolves()
      done()
    })

    afterEach(function (done) {
      InstanceService.deleteAllInstanceForks.restore()
      done()
    })
    describe('errors', function () {
      it('should reject if deleteIsolatedChildren failed', function (done) {
        const error = new Error('Error')
        InstanceService.deleteAllInstanceForks.rejects(error)
        Worker._deleteForks(testJob)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })
    })
    describe('success', function () {
      it('should work without error', function (done) {
        Worker._deleteForks(testJob).asCallback(done)
      })

      it('should call deleteAllInstanceForks with correct args', function (done) {
        Worker._deleteForks(testJob)
        .tap(function () {
          sinon.assert.calledOnce(InstanceService.deleteAllInstanceForks)
          sinon.assert.calledWithExactly(InstanceService.deleteAllInstanceForks, testJob.instance)
        })
        .asCallback(done)
      })
    })
  })
})
