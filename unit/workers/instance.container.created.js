/**
 * @module unit/workers/instance.container.created
 */
'use strict'

var clone = require('101/clone')
var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')
var noop = require('101/noop')
var sinon = require('sinon')

var rabbitMQ = require('models/rabbitmq')

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
            deploymentUuid: 'some-deployment-uuid'
          }
        }
      }
    }
    sinon.stub(InstanceService, 'updateContainerInspect').yieldsAsync(null, ctx.mockInstance)
    sinon.stub(rabbitMQ, 'startInstanceContainer', noop)
    done()
  })

  afterEach(function (done) {
    InstanceService.updateContainerInspect.restore()
    rabbitMQ.startInstanceContainer.restore()
    done()
  })

  describe('success', function () {
    it('should call 2 methods', function (done) {
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
        sinon.assert.calledOnce(InstanceService.updateContainerInspect)
        sinon.assert.calledWith(InstanceService.updateContainerInspect,
          query, updateData)
        sinon.assert.calledOnce(rabbitMQ.startInstanceContainer)
        var payload = {
          dockerContainer: ctx.data.id,
          dockerHost: ctx.data.host,
          instanceId: ctx.data.inspectData.Config.Labels.instanceId,
          ownerUsername: ctx.data.inspectData.Config.Labels.ownerUsername,
          sessionUserGithubId: ctx.data.inspectData.Config.Labels.sessionUserGithubId,
          tid: ctx.data.inspectData.Config.Labels.uuid,
          deploymentUuid: ctx.data.inspectData.Config.Labels.deploymentUuid
        }
        sinon.assert.calledWith(rabbitMQ.startInstanceContainer, payload)
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
        sinon.assert.notCalled(InstanceService.updateContainerInspect)
        sinon.assert.notCalled(rabbitMQ.startInstanceContainer)
        done()
      })
    })
    it('should fail if validation failed: {}', function (done) {
      InstanceContainerCreated({}).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.instanceOf(TaskFatalError)
        expect(err.message).to.equal('instance.container.created: Invalid Job')
        sinon.assert.notCalled(InstanceService.updateContainerInspect)
        sinon.assert.notCalled(rabbitMQ.startInstanceContainer)
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
        sinon.assert.notCalled(InstanceService.updateContainerInspect)
        sinon.assert.notCalled(rabbitMQ.startInstanceContainer)
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
        sinon.assert.calledOnce(InstanceService.updateContainerInspect)
        sinon.assert.calledWith(InstanceService.updateContainerInspect,
          query, updateData)
        sinon.assert.notCalled(rabbitMQ.startInstanceContainer)
        done()
      })
    })
  })
  // describe('_updateInstance', function () {
  //   beforeEach(function (done) {
  //     sinon.stub(InstanceService, 'updateContainerInspect').yieldsAsync(null, ctx.mockInstance)
  //     done()
  //   })
  //
  //   afterEach(function (done) {
  //     InstanceService.updateContainerInspect.restore()
  //     done()
  //   })
  //
  //   it('should find and update instance with container', function (done) {
  //     ctx.worker._updateInstance(function () {
  //       expect(InstanceService.updateContainerInspect.callCount).to.equal(1)
  //       sinon.assert.calledWith(
  //         InstanceService.updateContainerInspect,
  //         {
  //           _id: ctx.mockInstance._id,
  //           'contextVersion.id': ctx.data.inspectData.Config.Labels.contextVersionId,
  //           'container': {
  //             $exists: false
  //           }
  //         },
  //         {
  //           container: {
  //             dockerContainer: 111,
  //             dockerHost: '10.0.0.1',
  //             inspect: sinon.match.object,
  //             ports: [123]
  //           }
  //         },
  //         sinon.match.func
  //       )
  //       done()
  //     })
  //   })
  // })
  //
  // describe('_startContainer', function () {
  //   beforeEach(function (done) {
  //     sinon.stub(rabbitMQ, 'startInstanceContainer', noop)
  //     // normally set in findOneAndUpdate
  //     ctx.worker.instance = ctx.mockInstance
  //     done()
  //   })
  //   afterEach(function (done) {
  //     rabbitMQ.startInstanceContainer.restore()
  //     done()
  //   })
  //   it('should create a start-instance-container ctx.data', function (done) {
  //     ctx.worker._startContainer(function () {
  //       expect(rabbitMQ.startInstanceContainer.callCount).to.equal(1)
  //       expect(rabbitMQ.startInstanceContainer.args[0][0]).to.contain({
  //         dockerContainer: ctx.data.id,
  //         dockerHost: ctx.data.host,
  //         instanceId: ctx.mockInstance._id.toString(),
  //         ownerUsername: ctx.data.inspectData.Config.Labels.ownerUsername,
  //         sessionUserGithubId: ctx.data.inspectData.Config.Labels.sessionUserGithubId,
  //         tid: ctx.worker.logData.uuid
  //       })
  //       done()
  //     })
  //   })
  // })
})
