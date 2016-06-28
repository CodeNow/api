/**
 * @module unit/workers/instance.container.created
 */
'use strict'

var clone = require('101/clone')
var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')
var sinon = require('sinon')
require('sinon-as-promised')(require('bluebird'))

var Boom = require('dat-middleware').Boom
var ContextVersion = require('models/mongo/context-version')
var Docker = require('models/apis/docker')
var InstanceContainerCreated = require('workers/instance.container.created')
var InstanceService = require('models/services/instance-service')
var TaskFatalError = require('ponos').TaskFatalError

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('InstanceContainerCreated: ' + moduleName, function () {
  var ctx

  beforeEach(function (done) {
    ctx = {}
    ctx.mockInstance = {
      _id: '555',
      network: {
        hostIp: '0.0.0.0'
      },
      toJSON: function () { return {} }
    }
    ctx.data = {
      id: '111',
      host: '10.0.0.1',
      inspectData: {
        NetworkSettings: {
          Ports: [123]
        },
        Config: {
          Labels: {
            instanceId: ctx.mockInstance._id,
            ownerUsername: 'fifo',
            sessionUserGithubId: 444,
            contextVersionId: '123',
            tid: 'some-tid',
            deploymentUuid: 'some-deployment-uuid'
          }
        }
      }
    }
    ctx.cv = new ContextVersion({ _id: '123' })
    sinon.stub(ContextVersion, 'recoverAsync').resolves(ctx.cv)
    sinon.stub(InstanceService, 'updateContainerInspect').yieldsAsync(null, ctx.mockInstance)
    sinon.stub(InstanceService, 'startInstance').resolves(ctx.mockInstance)
    sinon.stub(Docker.prototype, 'removeContainerAsync').resolves(null)
    done()
  })

  afterEach(function (done) {
    ContextVersion.recoverAsync.restore()
    InstanceService.updateContainerInspect.restore()
    InstanceService.startInstance.restore()
    Docker.prototype.removeContainerAsync.restore()
    done()
  })

  describe('success', function () {
    it('should call 4 methods', function (done) {
      InstanceContainerCreated(ctx.data).asCallback(function (err) {
        expect(err).to.not.exist()
        var query = {
          '_id': ctx.data.inspectData.Config.Labels.instanceId,
          'contextVersion.id': ctx.data.inspectData.Config.Labels.contextVersionId,
          'container': {
            $exists: false
          }
        }
        var updateData = {
          container: {
            dockerContainer: ctx.data.id,
            dockerHost: ctx.data.host,
            inspect: ctx.data.inspectData,
            ports: ctx.data.inspectData.NetworkSettings.Ports
          }
        }
        sinon.assert.calledOnce(ContextVersion.recoverAsync)
        sinon.assert.calledWith(ContextVersion.recoverAsync, ctx.data.inspectData.Config.Labels.contextVersionId)
        sinon.assert.calledOnce(InstanceService.updateContainerInspect)
        sinon.assert.calledWith(InstanceService.updateContainerInspect,
          query, updateData)
        sinon.assert.calledOnce(InstanceService.startInstance)
        sinon.assert.calledWith(InstanceService.startInstance, ctx.mockInstance,
          ctx.data.inspectData.Config.Labels.sessionUserGithubId, ctx.data.inspectData.Config.Labels.tid)
        done()
      })
    })
  })
  describe('failure', function () {
    it('should fail if validation failed: null', function (done) {
      InstanceContainerCreated(null).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.instanceOf(TaskFatalError)
        expect(err.message).to.equal('instance.container.created: Invalid Job')
        sinon.assert.notCalled(ContextVersion.recoverAsync)
        sinon.assert.notCalled(InstanceService.updateContainerInspect)
        sinon.assert.notCalled(InstanceService.startInstance)
        done()
      })
    })

    it('should fail if validation failed: {}', function (done) {
      InstanceContainerCreated({}).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.instanceOf(TaskFatalError)
        expect(err.message).to.equal('instance.container.created: Invalid Job')
        sinon.assert.notCalled(ContextVersion.recoverAsync)
        sinon.assert.notCalled(InstanceService.updateContainerInspect)
        sinon.assert.notCalled(InstanceService.startInstance)
        done()
      })
    })

    it('should fail if validation failed: no labels', function (done) {
      var data = clone(ctx.data)
      data.inspectData.Config.Labels = null
      InstanceContainerCreated(data).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.instanceOf(TaskFatalError)
        expect(err.message).to.equal('instance.container.created: Invalid Job')
        sinon.assert.notCalled(ContextVersion.recoverAsync)
        sinon.assert.notCalled(InstanceService.updateContainerInspect)
        sinon.assert.notCalled(InstanceService.startInstance)
        done()
      })
    })

    it('should callback with error if context version fetch failed', function (done) {
      var mongoError = new Error('Mongo error')
      ContextVersion.recoverAsync.rejects(mongoError)
      InstanceContainerCreated(ctx.data).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal(mongoError.message)
        sinon.assert.calledOnce(ContextVersion.recoverAsync)
        sinon.assert.calledWith(ContextVersion.recoverAsync, ctx.data.inspectData.Config.Labels.contextVersionId)
        sinon.assert.notCalled(InstanceService.updateContainerInspect)
        sinon.assert.notCalled(InstanceService.startInstance)
        done()
      })
    })

    it('should fail if updateContainerInspect failed', function (done) {
      var mongoError = new Error('Mongo error')
      InstanceService.updateContainerInspect.yieldsAsync(mongoError)
      InstanceContainerCreated(ctx.data).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal(mongoError.message)
        var query = {
          '_id': ctx.data.inspectData.Config.Labels.instanceId,
          'contextVersion.id': ctx.data.inspectData.Config.Labels.contextVersionId,
          'container': {
            $exists: false
          }
        }
        var updateData = {
          container: {
            dockerContainer: ctx.data.id,
            dockerHost: ctx.data.host,
            inspect: ctx.data.inspectData,
            ports: ctx.data.inspectData.NetworkSettings.Ports
          }
        }
        sinon.assert.calledOnce(ContextVersion.recoverAsync)
        sinon.assert.calledWith(ContextVersion.recoverAsync, ctx.data.inspectData.Config.Labels.contextVersionId)
        sinon.assert.calledOnce(InstanceService.updateContainerInspect)
        sinon.assert.calledWith(InstanceService.updateContainerInspect,
          query, updateData)
        sinon.assert.notCalled(InstanceService.startInstance)
        done()
      })
    })

    it('should delete the container if it got a 409', function (done) {
      var updateConflict = Boom.conflict("Container was not updated, instance's container has changed")
      InstanceService.updateContainerInspect.yieldsAsync(updateConflict)
      InstanceContainerCreated(ctx.data).asCallback(function (err) {
        expect(err).to.exist()
        sinon.assert.calledOnce(Docker.prototype.removeContainerAsync)
        sinon.assert.calledWith(Docker.prototype.removeContainerAsync, ctx.data.id)
        done()
      })
    })

    it('should throw task fatal if the delete container step gets a 400 error', function (done) {
      var updateConflict = Boom.conflict("Container was not updated, instance's container has changed")
      InstanceService.updateContainerInspect.yieldsAsync(updateConflict)
      Docker.prototype.removeContainerAsync.rejects(Boom.badRequest())
      InstanceContainerCreated(ctx.data).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.instanceOf(TaskFatalError)
        expect(err.message).to.equal('instance.container.created: Failed to delete container')
        done()
      })
    })

    it('should callback with error if start instance failed failed', function (done) {
      var startInstanceError = new Error('Start instance error')
      InstanceService.startInstance.rejects(startInstanceError)
      InstanceContainerCreated(ctx.data).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal(startInstanceError.message)
        sinon.assert.calledOnce(ContextVersion.recoverAsync)
        sinon.assert.calledOnce(InstanceService.updateContainerInspect)
        sinon.assert.calledOnce(InstanceService.startInstance)
        done()
      })
    })
  })
})
