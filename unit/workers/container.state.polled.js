'use strict'

var Boom = require('dat-middleware').Boom
var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')
var sinon = require('sinon')
require('sinon-as-promised')(require('bluebird'))

var ConstainerStatePolled = require('workers/container.state.polled').task
var InstanceService = require('models/services/instance-service')
var Promise = require('bluebird')
var WorkerStopError = require('error-cat/errors/worker-stop-error')

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('ConstainerStatePolledWorker', function () {
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
    done()
  })
  afterEach(function (done) {
    InstanceService.modifyExistingContainerInspect.restore()
    InstanceService.emitInstanceUpdate.restore()
    done()
  })
  describe('success', function () {
    it('should call functions in order', function (done) {
      ConstainerStatePolled(ctx.data).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(InstanceService.modifyExistingContainerInspect)
        sinon.assert.calledOnce(InstanceService.emitInstanceUpdate)
        sinon.assert.callOrder(
          InstanceService.modifyExistingContainerInspect,
          InstanceService.emitInstanceUpdate)
        done()
      })
    })
  })
  describe('failure', function () {
    it('should fail if modifyExistingContainerInspect failed', function (done) {
      var mongoError = new Error('Mongo error')
      InstanceService.modifyExistingContainerInspect.rejects(mongoError)
      ConstainerStatePolled(ctx.data).asCallback(function (err) {
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
      ConstainerStatePolled(ctx.data).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.instanceOf(WorkerStopError)
        expect(err.message).to.equal('Instance not found')
        sinon.assert.calledOnce(InstanceService.modifyExistingContainerInspect)
        sinon.assert.calledWith(InstanceService.modifyExistingContainerInspect,
          ctx.mockInstance._id, ctx.data.id, ctx.data.inspectData)
        done()
      })
    })

    it('should fail if emitInstanceUpdate failed', function (done) {
      var mongoError = new Error('Mongo error')
      InstanceService.emitInstanceUpdate.rejects(mongoError)
      ConstainerStatePolled(ctx.data).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal(mongoError.message)
        sinon.assert.calledOnce(InstanceService.emitInstanceUpdate)
        sinon.assert.calledWith(InstanceService.emitInstanceUpdate,
          ctx.mockInstance, ctx.sessionUserGithubId, 'update', true)
        done()
      })
    })
  })
})
