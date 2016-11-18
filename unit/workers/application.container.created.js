/**
 * @module unit/workers/application.container.created
 */
'use strict'
const Code = require('code')
const Lab = require('lab')
const sinon = require('sinon')

const ContextVersion = require('models/mongo/context-version')
const Instance = require('models/mongo/instance')
const InstanceService = require('models/services/instance-service')
const rabbitMQ = require('models/rabbitmq')
const User = require('models/mongo/user')
const ApplicationContainerCreated = require('workers/application.container.created')

const lab = exports.lab = Lab.script()
const Worker = ApplicationContainerCreated._Worker
require('sinon-as-promised')(require('bluebird'))

const afterEach = lab.afterEach
const beforeEach = lab.beforeEach
const describe = lab.describe
const expect = Code.expect
const it = lab.it

describe('ApplicationContainerCreatedWorker Unit tests', function () {
  let testJob
  const testId = '123123123'
  const testHost = 'http://10.2.2.2:4242'
  const testInstanceId = '123123123'
  const testContextVersionId = '567865786'
  const testSessionUserGithubId = '7893'
  const testInspect = {
    NetworkSettings: {
      Ports: '8080'
    },
    Config: {
      Labels: {
        instanceId: testInstanceId,
        contextVersionId: testContextVersionId,
        sessionUserGithubId: testSessionUserGithubId
      }
    }
  }

  beforeEach(function (done) {
    testJob = {
      id: testId,
      host: testHost,
      inspectData: testInspect
    }

    done()
  })

  describe('task', function () {
    beforeEach(function (done) {
      sinon.stub(Worker.prototype, 'run').resolves()
      done()
    })

    afterEach(function (done) {
      Worker.prototype.run.restore()
      done()
    })

    it('should call run', (done) => {
      ApplicationContainerCreated.task(testJob).then(() => {
        sinon.assert.calledOnce(Worker.prototype.run)
        done()
      })
    }) // end task
  })

  describe('worker class', function () {
    let worker

    beforeEach(function (done) {
      worker = new Worker(testJob)
      done()
    })

    describe('run', function () {
      beforeEach(function (done) {
        sinon.stub(ContextVersion, 'recoverAsync').resolves()
        sinon.stub(Worker.prototype, '_findAndSetCreatingInstance')
        sinon.stub(Worker.prototype, '_startInstance')
        done()
      })

      afterEach(function (done) {
        Worker.prototype._findAndSetCreatingInstance.restore()
        Worker.prototype._startInstance.restore()
        ContextVersion.recoverAsync.restore()
        done()
      })

      it('should call flow', (done) => {
        worker.run().asCallback(() => {
          sinon.assert.callOrder(
            ContextVersion.recoverAsync,
            Worker.prototype._findAndSetCreatingInstance,
            Worker.prototype._startInstance
          )
          sinon.assert.calledWith(ContextVersion.recoverAsync, testContextVersionId)
          done()
        })
      })
    }) // end run

    describe('_findAndSetCreatingInstance', function () {
      beforeEach(function (done) {
        sinon.stub(Instance, 'markAsCreating')
        sinon.stub(Worker.prototype, '_removeContainerAndStopWorker')
        done()
      })

      afterEach(function (done) {
        Instance.markAsCreating.restore()
        Worker.prototype._removeContainerAndStopWorker.restore()
        done()
      })

      it('should call markAsCreating', (done) => {
        Instance.markAsCreating.resolves()
        worker._findAndSetCreatingInstance().asCallback((err) => {
          if (err) { return done(err) }
          sinon.assert.calledOnce(Instance.markAsCreating)
          sinon.assert.calledWith(Instance.markAsCreating,
            testInstanceId,
            testContextVersionId,
            testId, {
              dockerContainer: testId,
              dockerHost: testHost,
              inspect: testInspect,
              ports: testInspect.NetworkSettings.Ports
            })
          done()
        })

        it('should _removeContainerAndStopWorker on NotFound', (done) => {
          Instance.markAsCreating.rejects(new Instance.NotFoundError({}))
          worker._findAndSetCreatingInstance().asCallback((err) => {
            if (err) { return done(err) }
            sinon.assert.calledOnce(Instance.markAsCreating)
            sinon.assert.calledWith(Instance.markAsCreating,
              testInstanceId,
              testContextVersionId,
              testId, {
                dockerContainer: testId,
                dockerHost: testHost,
                inspect: testInspect,
                ports: testInspect.NetworkSettings.Ports
              })
            done()
          })
        })
      })
    }) // end _findAndSetCreatingInstance

    describe('_removeContainerAndStopWorker', function () {
      const testError = new Error('bad')

      beforeEach(function (done) {
        sinon.stub(rabbitMQ, 'deleteContainer')
        done()
      })

      afterEach(function (done) {
        rabbitMQ.deleteContainer.restore()
        done()
      })

      it('should publish container.remove', (done) => {
        rabbitMQ.deleteContainer.returns()
        worker._removeContainerAndStopWorker(testError).asCallback(() => {
          sinon.assert.calledOnce(rabbitMQ.deleteContainer)
          sinon.assert.calledWith(rabbitMQ.deleteContainer, { containerId: testId })
          done()
        })
      })
    }) // end _removeContainerAndStopWorker

    describe('_startInstance', function () {
      let testInstance

      beforeEach(function (done) {
        sinon.stub(InstanceService, 'startInstance')
        sinon.stub(User, 'findByGithubIdAsync')
        testInstance = {
          shsortHash: '12323'
        }
        done()
      })

      afterEach(function (done) {
        InstanceService.startInstance.restore()
        User.findByGithubIdAsync.restore()
        done()
      })

      it('should reject if no user found', (done) => {
        User.findByGithubIdAsync.resolves()
        worker._startInstance(testInstance).asCallback((err) => {
          expect(err.message).to.include('User not found')
          expect(err.data.extra.githubId).to.equal(testSessionUserGithubId)
          done()
        })
      })

      it('should start instance', (done) => {
        const testUser = {
          id: 'user'
        }
        User.findByGithubIdAsync.resolves(testUser)
        InstanceService.startInstance.resolves(testUser)
        worker._startInstance(testInstance).asCallback((err) => {
          if (err) { return done(err) }
          sinon.assert.calledOnce(User.findByGithubIdAsync)
          sinon.assert.calledWith(User.findByGithubIdAsync, testSessionUserGithubId)

          sinon.assert.calledOnce(InstanceService.startInstance)
          sinon.assert.calledWith(InstanceService.startInstance, testInspect.shsortHash, testUser)
          done()
        })
      })
    }) // end _startInstance
  }) // end worker class
})
