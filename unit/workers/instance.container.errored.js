/**
 * @module unit/workers/instance.container.errored
 */
'use strict'

require('sinon-as-promised')(require('bluebird'))
var Boom = require('dat-middleware').Boom
var Code = require('code')
var Lab = require('lab')
var omit = require('101/omit')
var sinon = require('sinon')
var WorkerStopError = require('error-cat/errors/worker-stop-error')

var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var Worker = require('workers/instance.container.errored')

var lab = exports.lab = Lab.script()

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('Workers: Instance Start', function () {
  var testInstanceId = '5633e9273e2b5b0c0077fd41'
  var dockerContainer = '46080d6253c8db55b8bbb9408654896964b86c63e863f1b3b0301057d1ad92ba'
  var testData
  var testInstance

  beforeEach(function (done) {
    testData = {
      instanceId: testInstanceId,
      containerId: dockerContainer,
      error: 'never do good',
      tid: 'some-tid-id'
    }
    sinon.stub(Instance, 'setContainerError').resolves(testInstance)
    sinon.stub(InstanceService, 'emitInstanceUpdate').resolves()
    done()
  })

  afterEach(function (done) {
    Instance.setContainerError.restore()
    InstanceService.emitInstanceUpdate.restore()
    done()
  })

  describe('validation', function () {
    it('should fatally fail if job is null', function (done) {
      Worker(null).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.an.instanceOf(WorkerStopError)
        expect(err.message).to.equal('Invalid Job')
        done()
      })
    })

    it('should fatally fail if job is {}', function (done) {
      Worker({}).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.an.instanceOf(WorkerStopError)
        expect(err.message).to.equal('Invalid Job')
        done()
      })
    })

    it('should fatally fail if job has no instanceId', function (done) {
      var data = omit(testData, 'instanceId')
      Worker(data).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.an.instanceOf(WorkerStopError)
        expect(err.message).to.equal('Invalid Job')
        done()
      })
    })

    it('should fatally fail if job has no containerId', function (done) {
      var data = omit(testData, 'containerId')
      Worker(data).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.an.instanceOf(WorkerStopError)
        expect(err.message).to.equal('Invalid Job')
        done()
      })
    })

    it('should fatally fail if job has no sessionUserGithubId', function (done) {
      var data = omit(testData, 'error')
      Worker(data).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.an.instanceOf(WorkerStopError)
        expect(err.message).to.equal('Invalid Job')
        done()
      })
    })
  }) // end validation

  describe('flow', function () {
    var testInstance = 'that instance'
    beforeEach(function (done) {
      Instance.setContainerError.resolves(testInstance)
      InstanceService.emitInstanceUpdate.resolves()
      done()
    })

    it('should call setContainerError', function (done) {
      Worker(testData).asCallback(function (err) {
        if (err) { return done(err) }
        sinon.assert.calledOnce(Instance.setContainerError)
        sinon.assert.calledWith(Instance.setContainerError,
          testData.instanceId,
          testData.containerId,
          testData.error)
        done()
      })
    })

    it('should WorkerStopError if instance not found', function (done) {
      Instance.setContainerError.rejects(Boom.notFound())
      Worker(testData).asCallback(function (err) {
        expect(err).to.be.an.instanceOf(WorkerStopError)
        expect(err.message).to.equal('Instance not found')
        done()
      })
    })

    it('should call emitInstanceUpdate', function (done) {
      Worker(testData).asCallback(function (err) {
        if (err) { return done(err) }
        sinon.assert.calledOnce(InstanceService.emitInstanceUpdate)
        sinon.assert.calledWith(InstanceService.emitInstanceUpdate, testInstance, null, 'errored', false)
        done()
      })
    })

    it('should call out to various models and helper methods in the correct order', function (done) {
      Worker(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.callOrder(
          Instance.setContainerError,
          InstanceService.emitInstanceUpdate)
        done()
      })
    })
  }) // end flow
})
