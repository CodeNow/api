'use strict'
const clone = require('101/clone')
const expect = require('code').expect
const Lab = require('lab')
const Promise = require('bluebird')
const sinon = require('sinon')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

const messenger = require('socket/messenger')
const OrganizationService = require('models/services/organization-service')
const rabbitMQ = require('models/rabbitmq')
const Worker = require('workers/docker.events-stream.connected')

require('sinon-as-promised')(Promise)
const lab = exports.lab = Lab.script()

const afterEach = lab.afterEach
const beforeEach = lab.beforeEach
const describe = lab.describe
const it = lab.it

describe('docker.events-stream.connected unit test', function () {
  const testDockerHostIP = '10.0.0.2'
  const testHost = `http://${testDockerHostIP}:4242`
  const testOrg = '12345'
  const baseJob = {
    host: testHost,
    org: testOrg
  }
  let testJob

  beforeEach(function (done) {
    testJob = clone(baseJob)
    sinon.stub(OrganizationService, 'getByGithubId').resolves({ id: 1 })
    sinon.stub(OrganizationService, 'updateById').resolves({ id: 1 })
    sinon.stub(rabbitMQ, 'firstDockCreated').returns()
    sinon.stub(messenger, 'emitFirstDockCreated').returns()
    done()
  })

  afterEach(function (done) {
    OrganizationService.getByGithubId.restore()
    OrganizationService.updateById.restore()
    rabbitMQ.firstDockCreated.restore()
    messenger.emitFirstDockCreated.restore()
    done()
  })

  describe('valid job', function () {
    it('should fail if `updateByGithubId` failed', function (done) {
      OrganizationService.updateById.rejects(new Error('Orgtanization could not be updated'))
      Worker.task(testJob)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(err)
          done()
        })
    })

    it('should fatally fail if messenger call failed', function (done) {
      messenger.emitFirstDockCreated.throws(new Error('Primus error'))
      Worker.task(testJob)
        .asCallback(function (err) {
          expect(err).to.be.instanceof(WorkerStopError)
          expect(err.message).to.include('Failed to create job or send websocket event')
          expect(err.data.err.message).to.equal('Primus error')
          done()
        })
    })

    it('should fatally fail org not found', function (done) {
      OrganizationService.getByGithubId.throws(new Error('Organization not found'))
      Worker.task(testJob)
        .asCallback(function (err) {
          expect(err).to.be.instanceof(WorkerStopError)
          expect(err.message).to.include('Organization not found')
          done()
        })
    })

    it('should fatally fail if rabbimq call failed', function (done) {
      rabbitMQ.firstDockCreated.throws(new Error('Rabbit error'))
      Worker.task(testJob)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.be.instanceof(WorkerStopError)
          expect(err.message).to.include('Failed to create job or send websocket event')
          expect(err.data.err.message).to.equal('Rabbit error')
          done()
        })
    })

    it('should fail if org already has firstDockCreated failed', function (done) {
      OrganizationService.getByGithubId.resolves({ firstDockCreated: true })
      Worker.task(testJob)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.be.instanceof(WorkerStopError)
          expect(err.message).to.include('firstDockCreated was set before')
          done()
        })
    })

    it('should call OrganizationService.getByGithubId with correct params', function (done) {
      Worker.task(testJob)
        .tap(function () {
          sinon.assert.calledOnce(OrganizationService.updateById)
          sinon.assert.calledWith(OrganizationService.updateById,
            1
          )
        })
        .asCallback(done)
    })

    it('should call OrganizationService.updateByGithubId with correct params', function (done) {
      Worker.task(testJob)
      .tap(function () {
        sinon.assert.calledOnce(OrganizationService.updateById)
        sinon.assert.calledWith(OrganizationService.updateById,
          1,
          { firstDockCreated: true }
        )
      })
      .asCallback(done)
    })

    it('should call messenger.emitFirstDockCreated with correct params', function (done) {
      Worker.task(testJob)
      .tap(function () {
        sinon.assert.calledOnce(messenger.emitFirstDockCreated)
        sinon.assert.calledWith(messenger.emitFirstDockCreated, parseInt(testOrg, 10))
      })
      .asCallback(done)
    })

    it('should call rabbitMQ.firstDockCreated with correct params', function (done) {
      Worker.task(testJob)
      .tap(function () {
        sinon.assert.calledOnce(rabbitMQ.firstDockCreated)
        sinon.assert.calledWith(rabbitMQ.firstDockCreated,
          {
            githubId: parseInt(testOrg, 10),
            dockerHostIp: testDockerHostIP
          }
        )
      })
      .asCallback(done)
    })

    it('should call all functions in order', function (done) {
      Worker.task(testJob)
      .tap(function () {
        sinon.assert.callOrder(
          OrganizationService.getByGithubId,
          OrganizationService.updateById,
          messenger.emitFirstDockCreated,
          rabbitMQ.firstDockCreated)
      })
      .asCallback(done)
    })
  }) // end valid job
}) // end docker.events-stream.connected unit test
