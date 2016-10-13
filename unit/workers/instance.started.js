/**
 * @module unit/workers/instance.started
 */
'use strict'

require('sinon-as-promised')(require('bluebird'))
const Code = require('code')
const Lab = require('lab')
const sinon = require('sinon')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

const Instance = require('models/mongo/instance')
const InstanceService = require('models/services/instance-service')
const Worker = require('workers/instance.started')

const lab = exports.lab = Lab.script()

const afterEach = lab.afterEach
const beforeEach = lab.beforeEach
const describe = lab.describe
const expect = Code.expect
const it = lab.it

describe('Workers: Instance Started', function () {
  const testInstanceId = '5633e9273e2b5b0c0077fd41'
  const testData = {
    instanceId: testInstanceId
  }
  let testInstance

  beforeEach(function (done) {
    testInstance = new Instance({
      _id: testInstanceId,
      container: {
        inspect: {
          State: {
            Status: 'running'
          }
        }
      }
    })
    sinon.stub(Instance, 'findByIdAsync').resolves(testInstance)
    sinon.stub(InstanceService, 'emitInstanceUpdate').resolves()
    done()
  })

  afterEach(function (done) {
    Instance.findByIdAsync.restore()
    InstanceService.emitInstanceUpdate.restore()
    done()
  })

  it('should fail if findByIdAsync failed', function (done) {
    var error = new Error('Mongo error')
    Instance.findByIdAsync.rejects(error)
    Worker.task(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
      done()
    })
  })

  it('should worker stop if findByIdAsync returned no instance', function (done) {
    Instance.findByIdAsync.resolves(null)
    Worker.task(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err).to.be.instanceOf(WorkerStopError)
      expect(err.message).to.equal('Instance not found')
      done()
    })
  })

  it('should worker stop if instance is not running', function (done) {
    const startingInstance = new Instance({
      _id: testInstanceId,
      container: {
        inspect: {
          State: {
            Status: 'starting'
          }
        }
      }
    })
    Instance.findByIdAsync.resolves(startingInstance)
    Worker.task(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err).to.be.instanceOf(WorkerStopError)
      expect(err.message).to.equal('Instance is not running')
      done()
    })
  })

  it('should fail if sending events failed', function (done) {
    const error = new Error('Primus error')
    InstanceService.emitInstanceUpdate.rejects(error)
    Worker.task(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
      done()
    })
  })

  it('should call emitInstanceUpdate', function (done) {
    Worker.task(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.calledOnce(InstanceService.emitInstanceUpdate)
      sinon.assert.calledWith(InstanceService.emitInstanceUpdate, testInstance, null, 'start')
      done()
    })
  })

  it('should call out to various models and helper methods in the correct order', function (done) {
    Worker.task(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.callOrder(
        Instance.findByIdAsync,
        InstanceService.emitInstanceUpdate)
      done()
    })
  })
})
