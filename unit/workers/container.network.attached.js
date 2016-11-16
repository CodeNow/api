/**
 * @module unit/workers/container.network.attached
 */
'use strict'

const Lab = require('lab')
const lab = exports.lab = Lab.script()

const Code = require('code')
const sinon = require('sinon')
require('sinon-as-promised')(require('bluebird'))

const objectId = require('objectid')
const Worker = require('workers/container.network.attached').task
const Instance = require('models/mongo/instance')
const InstanceService = require('models/services/instance-service')
const Isolation = require('models/mongo/isolation')
const rabbitMQ = require('models/rabbitmq')

const WorkerStopError = require('error-cat/errors/worker-stop-error')
const afterEach = lab.afterEach
const beforeEach = lab.beforeEach
const describe = lab.describe
const expect = Code.expect
const it = lab.it

describe('Workers: Container Network Attach', function () {
  const testData = {
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
  const mockInstance = new Instance({
    _id: objectId('507f191e810c19729de860ea'),
    name: 'mockInstance',
    owner: {
      github: 999
    }
  })
  const mockModifiedInstance = new Instance({
    _id: objectId('507f191e810c19729de860ea'),
    modified: true,
    isolated: objectId('507f191e810c19729de860ea'),
    owner: {
      github: 999
    }
  })

  const mockIsolation = {
    state: 'killing'
  }
  beforeEach(function (done) {
    sinon.stub(Instance, 'findOneByContainerIdAsync').resolves(mockInstance)
    sinon.stub(InstanceService, 'modifyExistingContainerInspect').resolves(mockModifiedInstance)
    sinon.stub(rabbitMQ, 'publishInstanceStarted').returns()
    sinon.stub(InstanceService, 'killInstance').resolves({})
    sinon.stub(Isolation, 'findOneAsync').resolves(mockIsolation)
    done()
  })

  afterEach(function (done) {
    Instance.findOneByContainerIdAsync.restore()
    InstanceService.modifyExistingContainerInspect.restore()
    rabbitMQ.publishInstanceStarted.restore()
    InstanceService.killInstance.restore()
    Isolation.findOneAsync.restore()
    done()
  })

  it('should fail if findOneByContainerIdAsync failed', function (done) {
    const error = new Error('Mongo error')
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
    const error = new Error('Redis error')
    Worker(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
      done()
    })
  })

  it('should fail if modifyExistingContainerInspect fails', function (done) {
    const error = new Error('Mongodb error')
    InstanceService.modifyExistingContainerInspect.rejects(error)
    Worker(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
      done()
    })
  })

  it('should task fatal if modifyExistingContainerInspect returns conflict', function (done) {
    const error = new Error('Conflict')
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

  it('should fail if Isolation.findOneAsync fails', function (done) {
    const error = new Error('Mongodb error')
    Isolation.findOneAsync.rejects(error)
    Worker(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
      done()
    })
  })

  it('should fail if InstanceService.killInstance fails', function (done) {
    const error = new Error('Mongodb error')
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

  it('should not call publishInstanceStarted if instance was killed', function (done) {
    Worker(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.notCalled(rabbitMQ.publishInstanceStarted)
      done()
    })
  })

  it('should call publishInstanceStarted', function (done) {
    Isolation.findOneAsync.resolves({})
    Worker(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      const inst = mockModifiedInstance.toJSON()
      inst._id = mockModifiedInstance._id.toString()
      sinon.assert.calledOnce(rabbitMQ.publishInstanceStarted)
      sinon.assert.calledWith(rabbitMQ.publishInstanceStarted,
        {
          instance: inst
        }
      )
      done()
    })
  })
})
