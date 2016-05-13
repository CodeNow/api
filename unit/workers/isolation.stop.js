/**
 * @module unit/workers/isolation.stop
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var omit = require('101/omit')
var Code = require('code')
var sinon = require('sinon')
require('sinon-as-promised')(require('bluebird'))

var Worker = require('workers/isolation.stop')
var Isolation = require('models/mongo/isolation')
var IsolationService = require('models/services/isolation-service')
var InstanceService = require('models/services/instance-service')

var TaskFatalError = require('ponos').TaskFatalError
var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('Workers: Isolation Stop', function () {
  var testIsolationId = '5633e9273e2b5b0c0077fd41'
  var testData = {
    isolationId: testIsolationId,
    redeployOnStopped: true
  }
  var instancesToStop = [
    {
      id: '123',
      container: {
        inspect: {
          State: {
            Starting: true
          }
        }
      }
    }, {
      id: '456',
      container: {
        inspect: {
          State: {
            Starting: false
          }
        }
      }
    }, {
      id: '789',
      container: {
        inspect: {
          State: {
            Starting: false
          }
        }
      }
    }
  ]
  beforeEach(function (done) {
    sinon.stub(Isolation, 'findOneAndUpdate').resolves({})
    sinon.stub(IsolationService, 'findInstancesToStop').resolves(instancesToStop)
    sinon.stub(InstanceService, 'killInstance').resolves()
    done()
  })

  afterEach(function (done) {
    Isolation.findOneAndUpdate.restore()
    IsolationService.findInstancesToStop.restore()
    InstanceService.killInstance.restore()
    done()
  })

  describe('validation', function () {
    it('should fatally fail if job is null', function (done) {
      Worker(null).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.an.instanceOf(TaskFatalError)
        expect(err.message).to.equal('isolation.stop: Invalid Job')
        done()
      })
    })

    it('should fatally fail if job is {}', function (done) {
      Worker({}).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.an.instanceOf(TaskFatalError)
        expect(err.message).to.equal('isolation.stop: Invalid Job')
        done()
      })
    })

    it('should fatally fail if job has no isolationId', function (done) {
      var data = omit(testData, 'isolationId')
      Worker(data).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.an.instanceOf(TaskFatalError)
        expect(err.message).to.equal('isolation.stop: Invalid Job')
        done()
      })
    })
  })

  it('should fail if findOneAndUpdate failed', function (done) {
    var error = new Error('Mongo error')
    Isolation.findOneAndUpdate.rejects(error)
    Worker(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
      done()
    })
  })

  it('should fail if findInstancesToStop failed', function (done) {
    var error = new Error('Mongo error')
    IsolationService.findInstancesToStop.rejects(error)
    Worker(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
      done()
    })
  })

  it('should fail if killInstance failed', function (done) {
    var error = new Error('instance kill error')
    InstanceService.killInstance.rejects(error)
    Worker(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
      done()
    })
  })

  it('should update the isolation with the restarting flag', function (done) {
    Worker(testData)
      .then(function () {
        sinon.assert.calledOnce(Isolation.findOneAndUpdate)
        sinon.assert.calledWith(Isolation.findOneAndUpdate, {
          _id: testData.isolationId
        }, {
          $set: {
            stopping: true,
            redeployOnStopped: true
          }
        })
      })
      .asCallback(done)
  })

  it('should set the isolation with the restarting flag to false', function (done) {
    testData.redeployOnStopped = false
    Worker(testData)
      .then(function () {
        sinon.assert.calledOnce(Isolation.findOneAndUpdate)
        sinon.assert.calledWith(Isolation.findOneAndUpdate, {
          _id: testData.isolationId
        }, {
          $set: {
            stopping: true,
            redeployOnStopped: false
          }
        })
      })
      .asCallback(done)
  })

  it('should only call kill instance on non starting instances', function (done) {
    Worker(testData)
      .then(function () {
        sinon.assert.calledTwice(InstanceService.killInstance)
        sinon.assert.calledWith(InstanceService.killInstance, instancesToStop[1])
        sinon.assert.calledWith(InstanceService.killInstance, instancesToStop[2])
      })
      .asCallback(done)
  })
})
