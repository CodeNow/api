/**
 * @module unit/workers/isolation.kill
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')
var sinon = require('sinon')
require('sinon-as-promised')(require('bluebird'))

var Worker = require('workers/container.network.attached').task
var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var Isolation = require('models/mongo/isolation')
var Hosts = require('models/redis/hosts')

var WorkerStopError = require('error-cat/errors/worker-stop-error')
var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('Workers: Container Network Attach', function () {
  var testData = {
    id: 'dockerContainerId',
    containerIp: '127.0.0.1',
    inspectData: {
      Config: {
        Labels: {
          ownerUsername: 'myztiq',
          instanceId: '1234'
        }
      },
      NetworkSettings: {
        Ports: {
          '80/tcp': [
            {
              'HostIp': '0.0.0.0',
              'HostPort': '64573'
            }
          ],
          '8080/tcp': [
            {
              'HostIp': '0.0.0.0',
              'HostPort': '64574'
            }
          ]
        }
      }
    }
  }
  var mockInstance = {
    _id: '1234',
    name: 'mockInstance'
  }
  var mockModifiedInstance = {
    _id: '1234',
    modified: true,
    isolated: 'isolatedId'
  }
  var mockIsolation = {
    state: 'killing'
  }
  beforeEach(function (done) {
    sinon.stub(Instance, 'findOneByContainerIdAsync').resolves(mockInstance)
    sinon.stub(Hosts.prototype, 'upsertHostsForInstanceAsync').resolves(mockInstance)
    sinon.stub(InstanceService, 'modifyExistingContainerInspect').resolves(mockModifiedInstance)
    sinon.stub(InstanceService, 'emitInstanceUpdate').resolves({})
    sinon.stub(InstanceService, 'killInstance').resolves({})
    sinon.stub(Isolation, 'findOneAsync').resolves(mockIsolation)
    done()
  })

  afterEach(function (done) {
    Instance.findOneByContainerIdAsync.restore()
    Hosts.prototype.upsertHostsForInstanceAsync.restore()
    InstanceService.modifyExistingContainerInspect.restore()
    InstanceService.emitInstanceUpdate.restore()
    InstanceService.killInstance.restore()
    Isolation.findOneAsync.restore()
    done()
  })

  it('should fail if findOneByContainerIdAsync failed', function (done) {
    var error = new Error('Mongo error')
    Instance.findOneByContainerIdAsync.rejects(error)
    Worker(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
      done()
    })
  })

  it('should fail if findOneByContainerIdAsync returns no instance', function (done) {
    Instance.findOneByContainerIdAsync.resolves(null)
    Worker(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err).to.be.an.instanceOf(WorkerStopError)
      expect(err.message).to.equal('Instance not found')
      done()
    })
  })

  it('should fail if upsertHostsForInstanceAsync fails', function (done) {
    var error = new Error('Redis error')
    Hosts.prototype.upsertHostsForInstanceAsync.rejects(error)
    Worker(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
      done()
    })
  })

  it('should fail if modifyExistingContainerInspect fails', function (done) {
    var error = new Error('Mongodb error')
    InstanceService.modifyExistingContainerInspect.rejects(error)
    Worker(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
      done()
    })
  })

  it('should task fatal if modifyExistingContainerInspect returns conflict', function (done) {
    var error = new Error('Conflict')
    error.output = {
      statusCode: 409
    }
    InstanceService.modifyExistingContainerInspect.rejects(error)
    Worker(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err).to.be.an.instanceOf(WorkerStopError)
      expect(err.message).to.equal('Instance not found')
      done()
    })
  })

  it('should fail if emitInstanceUpdate fails', function (done) {
    Isolation.findOneAsync.resolves({})
    var error = new Error('Mongodb error')
    InstanceService.emitInstanceUpdate.rejects(error)
    Worker(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
      done()
    })
  })

  it('should fail if Isolation.findOneAsync fails', function (done) {
    var error = new Error('Mongodb error')
    Isolation.findOneAsync.rejects(error)
    Worker(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
      done()
    })
  })

  it('should fail if InstanceService.killInstance fails', function (done) {
    var error = new Error('Mongodb error')
    InstanceService.killInstance.rejects(error)
    Worker(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
      done()
    })
  })

  it('should call findOneByContainerIdAsync', function (done) {
    Worker(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.calledOnce(Instance.findOneByContainerIdAsync)
      sinon.assert.calledWith(Instance.findOneByContainerIdAsync, testData.id)
      done()
    })
  })

  it('should call upsertHostsForInstanceAsync', function (done) {
    Worker(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.calledOnce(Hosts.prototype.upsertHostsForInstanceAsync)
      sinon.assert.calledWith(Hosts.prototype.upsertHostsForInstanceAsync,
        'myztiq',
        mockInstance,
        mockInstance.name,
        {
          ports: testData.inspectData.NetworkSettings.Ports
        }
      )
      done()
    })
  })

  it('should call modifyExistingContainerInspect', function (done) {
    Worker(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.calledOnce(InstanceService.modifyExistingContainerInspect)
      sinon.assert.calledWith(InstanceService.modifyExistingContainerInspect,
        mockInstance._id,
        testData.id,
        testData.inspectData,
        testData.containerIp
      )
      done()
    })
  })

  it('should call Isolation.findOneAsync', function (done) {
    Worker(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.calledOnce(Isolation.findOneAsync)
      sinon.assert.calledWith(Isolation.findOneAsync, {_id: mockModifiedInstance.isolated})
      done()
    })
  })

  it('should call InstanceService.killInstance', function (done) {
    Worker(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.calledOnce(InstanceService.killInstance)
      sinon.assert.calledWith(InstanceService.killInstance, mockModifiedInstance)
      done()
    })
  })

  it('should not call emitInstanceUpdate if instance was killed', function (done) {
    Worker(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.notCalled(InstanceService.emitInstanceUpdate)
      done()
    })
  })

  it('should call emitInstanceUpdate', function (done) {
    Isolation.findOneAsync.resolves({})
    Worker(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.calledOnce(InstanceService.emitInstanceUpdate)
      sinon.assert.calledWith(InstanceService.emitInstanceUpdate,
        mockModifiedInstance,
        null,
        'start'
      )
      done()
    })
  })
})
