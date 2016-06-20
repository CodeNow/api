/**
 * @module unit/workers/instance.container.died
 */
'use strict'
var clone = require('101/clone')
var Boom = require('dat-middleware').Boom
var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')
var sinon = require('sinon')
require('sinon-as-promised')(require('bluebird'))

var InstanceContainerDied = require('workers/instance.container.died')
var InstanceService = require('models/services/instance-service')
var IsolationService = require('models/services/isolation-service')
var Promise = require('bluebird')
var rabbitMQ = require('models/rabbitmq')
var TaskFatalError = require('ponos').TaskFatalError

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('InstanceContainerDiedWorker', function () {
  var ctx

  beforeEach(function (done) {
    ctx = {}
    ctx.mockInstance = {
      _id: '5633e9273e2b5b0c0077fd41',
      name: 'name1',
      shortHash: 'asd51a1',
      owner: {
        github: '',
        username: 'foo',
        gravatar: ''
      },
      createdBy: {
        github: '',
        username: '',
        gravatar: ''
      },
      network: {
        hostIp: '0.0.0.0'
      },
      isolated: 'isolatedId',
      isTesting: true
    }
    ctx.instanceId = '5633e9273e2b5b0c0077fd41'
    ctx.sessionUserGithubId = 111987
    ctx.data = {
      id: 'container-id-1',
      status: 'die'
    }
    ctx.data.inspectData = {
      Config: {
        Labels: {
          instanceId: ctx.instanceId,
          ownerUsername: 'anton',
          sessionUserGithubId: ctx.sessionUserGithubId,
          contextVersionId: 'some-cv-id'
        }
      },
      State: {
        ExitCode: 0,
        FinishedAt: '0001-01-01T00:00:00Z',
        Paused: false,
        Pid: 889,
        Restarting: false,
        Running: true,
        StartedAt: '2014-11-25T22:29:50.23925175Z'
      },
      NetworkSettings: {
        IPAddress: '172.17.14.13',
        Ports: {
          '3000/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '34109'}],
          '80/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '34110'}],
          '8000/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '34111'}],
          '8080/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '34108'}]
        }
      }
    }
    done()
  })
  beforeEach(function (done) {
    sinon.stub(InstanceService, 'modifyExistingContainerInspect').resolves(ctx.mockInstance)
    sinon.stub(InstanceService, 'emitInstanceUpdate').returns()
    sinon.stub(IsolationService, 'redeployIfAllKilled').resolves()
    sinon.stub(IsolationService, 'isTestingIsolation').resolves(false)
    sinon.stub(rabbitMQ, 'killIsolation')
    sinon.stub(rabbitMQ, 'clearContainerMemory')
    done()
  })
  afterEach(function (done) {
    InstanceService.modifyExistingContainerInspect.restore()
    InstanceService.emitInstanceUpdate.restore()
    IsolationService.redeployIfAllKilled.restore()
    IsolationService.isTestingIsolation.restore()
    rabbitMQ.killIsolation.restore()
    rabbitMQ.clearContainerMemory.restore()
    done()
  })
  describe('success', function () {
    it('should call functions in order', function (done) {
      InstanceContainerDied(ctx.data).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(InstanceService.modifyExistingContainerInspect)
        sinon.assert.notCalled(rabbitMQ.clearContainerMemory)
        sinon.assert.calledOnce(rabbitMQ.killIsolation)
        sinon.assert.calledOnce(InstanceService.emitInstanceUpdate)
        sinon.assert.calledOnce(IsolationService.isTestingIsolation)
        sinon.assert.calledOnce(IsolationService.redeployIfAllKilled)
        sinon.assert.callOrder(
          InstanceService.modifyExistingContainerInspect,
          InstanceService.emitInstanceUpdate,
          rabbitMQ.killIsolation,
          IsolationService.isTestingIsolation,
          IsolationService.redeployIfAllKilled)
        done()
      })
    })

    it('should not clean memory if non-testing instance', function (done) {
      var instance = clone(ctx.mockInstance)
      instance.isTesting = false
      InstanceService.modifyExistingContainerInspect.resolves(instance)
      InstanceContainerDied(ctx.data).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(InstanceService.modifyExistingContainerInspect)
        sinon.assert.notCalled(rabbitMQ.clearContainerMemory)
        sinon.assert.notCalled(rabbitMQ.killIsolation)
        sinon.assert.calledOnce(InstanceService.emitInstanceUpdate)
        sinon.assert.calledOnce(IsolationService.isTestingIsolation)
        sinon.assert.calledOnce(IsolationService.redeployIfAllKilled)
        sinon.assert.callOrder(
          InstanceService.modifyExistingContainerInspect,
          InstanceService.emitInstanceUpdate,
          IsolationService.isTestingIsolation,
          IsolationService.redeployIfAllKilled)
        done()
      })
    })

    it('should not kill isolation if non-isolated instance', function (done) {
      var instance = clone(ctx.mockInstance)
      instance.isolated = null
      InstanceService.modifyExistingContainerInspect.resolves(instance)
      InstanceContainerDied(ctx.data).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(InstanceService.modifyExistingContainerInspect)
        sinon.assert.notCalled(rabbitMQ.clearContainerMemory)
        sinon.assert.notCalled(rabbitMQ.killIsolation)
        sinon.assert.calledOnce(InstanceService.emitInstanceUpdate)
        sinon.assert.notCalled(IsolationService.isTestingIsolation)
        sinon.assert.notCalled(IsolationService.redeployIfAllKilled)
        sinon.assert.callOrder(
          InstanceService.modifyExistingContainerInspect,
          InstanceService.emitInstanceUpdate)
        done()
      })
    })

    it('should not kill isolation if isTesting isolationMaster', function (done) {
      IsolationService.isTestingIsolation.resolves(true)
      InstanceContainerDied(ctx.data).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(InstanceService.modifyExistingContainerInspect)
        sinon.assert.calledOnce(rabbitMQ.clearContainerMemory)
        sinon.assert.calledOnce(rabbitMQ.killIsolation)
        sinon.assert.calledOnce(InstanceService.emitInstanceUpdate)
        sinon.assert.calledOnce(IsolationService.isTestingIsolation)
        sinon.assert.notCalled(IsolationService.redeployIfAllKilled)
        sinon.assert.callOrder(
          InstanceService.modifyExistingContainerInspect,
          InstanceService.emitInstanceUpdate,
          rabbitMQ.killIsolation,
          IsolationService.isTestingIsolation,
          rabbitMQ.clearContainerMemory)
        done()
      })
    })

    it('should publish rabbit jobs', function (done) {
      IsolationService.isTestingIsolation.resolves(true)
      InstanceContainerDied(ctx.data).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(rabbitMQ.clearContainerMemory)
        sinon.assert.calledWith(rabbitMQ.clearContainerMemory, {
          containerId: ctx.data.id
        })
        sinon.assert.calledOnce(rabbitMQ.killIsolation)
        sinon.assert.calledWith(rabbitMQ.killIsolation, {
          isolationId: ctx.mockInstance.isolated,
          triggerRedeploy: false
        })
        done()
      })
    })
  })
  describe('failure', function () {
    it('should fail if validation failed: null', function (done) {
      InstanceContainerDied(null).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.instanceOf(TaskFatalError)
        expect(err.message).to.equal('instance.container.died: Invalid Job')
        sinon.assert.notCalled(InstanceService.modifyExistingContainerInspect)
        sinon.assert.notCalled(InstanceService.emitInstanceUpdate)
        done()
      })
    })

    it('should fail if validation failed: {}', function (done) {
      InstanceContainerDied({}).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.instanceOf(TaskFatalError)
        expect(err.message).to.equal('instance.container.died: Invalid Job')
        sinon.assert.notCalled(InstanceService.modifyExistingContainerInspect)
        sinon.assert.notCalled(InstanceService.emitInstanceUpdate)
        done()
      })
    })

    it('should fail if validation failed: no labels', function (done) {
      var data = clone(ctx.data)
      data.inspectData.Config.Labels = null
      InstanceContainerDied(data).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.instanceOf(TaskFatalError)
        expect(err.message).to.equal('instance.container.died: Invalid Job')
        sinon.assert.notCalled(InstanceService.modifyExistingContainerInspect)
        sinon.assert.notCalled(InstanceService.emitInstanceUpdate)
        done()
      })
    })

    it('should fail if modifyExistingContainerInspect failed', function (done) {
      var mongoError = new Error('Mongo error')
      InstanceService.modifyExistingContainerInspect.rejects(mongoError)
      InstanceContainerDied(ctx.data).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal(mongoError.message)
        sinon.assert.calledOnce(InstanceService.modifyExistingContainerInspect)
        sinon.assert.calledWith(InstanceService.modifyExistingContainerInspect,
          ctx.mockInstance._id, ctx.data.id, ctx.data.inspectData)
        done()
      })
    })

    it('should fail if modifyExistingContainerInspect returned 409', function (done) {
      var conflictErr = Boom.conflict('Instance not found')
      InstanceService.modifyExistingContainerInspect.rejects(conflictErr)
      InstanceContainerDied(ctx.data).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.instanceOf(TaskFatalError)
        expect(err.level).to.equal('warning')
        expect(err.message).to.equal('instance.container.died: Instance not found')
        sinon.assert.calledOnce(InstanceService.modifyExistingContainerInspect)
        sinon.assert.calledWith(InstanceService.modifyExistingContainerInspect,
          ctx.mockInstance._id, ctx.data.id, ctx.data.inspectData)
        done()
      })
    })

    it('should fail if emitInstanceUpdate failed', function (done) {
      var mongoError = new Error('Mongo error')
      var rejectionPromise = Promise.reject(mongoError)
      rejectionPromise.suppressUnhandledRejections()
      InstanceService.emitInstanceUpdate.returns(rejectionPromise)
      InstanceContainerDied(ctx.data).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal(mongoError.message)
        sinon.assert.calledOnce(InstanceService.emitInstanceUpdate)
        sinon.assert.calledWith(InstanceService.emitInstanceUpdate,
          ctx.mockInstance, ctx.sessionUserGithubId, 'update', true)
        done()
      })
    })

    it('should fail if isTestingIsolation failed', function (done) {
      var mongoError = new Error('Mongo error')
      IsolationService.isTestingIsolation.rejects(mongoError)
      InstanceContainerDied(ctx.data).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal(mongoError.message)
        sinon.assert.calledOnce(IsolationService.isTestingIsolation)
        sinon.assert.calledWith(IsolationService.isTestingIsolation, ctx.mockInstance.isolated)
        done()
      })
    })
    it('should fail if IsolationService.redeployIfAllKilled failed', function (done) {
      var error = new Error('Mongo error')
      IsolationService.redeployIfAllKilled.rejects(error)
      InstanceContainerDied(ctx.data).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal(error.message)
        sinon.assert.calledOnce(IsolationService.redeployIfAllKilled)
        sinon.assert.calledWith(IsolationService.redeployIfAllKilled, ctx.mockInstance.isolated)
        done()
      })
    })
  })
})
