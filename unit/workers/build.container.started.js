/**
 * @module unit/workers/build.container.started
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var clone = require('101/clone')
var Code = require('code')
var noop = require('101/noop')
var sinon = require('sinon')
var WorkerStopError = require('error-cat/errors/worker-stop-error')

var BuildContainerCreated = require('workers/build.container.started').task
var ContextVersion = require('models/mongo/context-version')
var InstanceService = require('models/services/instance-service')
var messenger = require('socket/messenger')

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('ImageBuilderContainerStarted unit test', function () {
  var testCvBuildId = 'dat_cv_id'
  var testJobData = {
    inspectData: {
      Config: {
        Labels: {
          'contextVersion.build._id': testCvBuildId
        }
      }
    }
  }
  var testJob

  beforeEach(function (done) {
    testJob = clone(testJobData)
    done()
  })

  describe('valid job', function () {
    beforeEach(function (done) {
      sinon.stub(ContextVersion, 'updateAsync')
      sinon.stub(ContextVersion, 'findAsync')
      sinon.stub(InstanceService, 'emitInstanceUpdateByCvBuildId').returns()
      sinon.stub(messenger, 'emitContextVersionUpdate')
      done()
    })

    afterEach(function (done) {
      ContextVersion.updateAsync.restore()
      ContextVersion.findAsync.restore()
      InstanceService.emitInstanceUpdateByCvBuildId.restore()
      messenger.emitContextVersionUpdate.restore()
      done()
    })

    it('should call update correctly', function (done) {
      ContextVersion.updateAsync.returns(1)
      ContextVersion.findAsync.returns([])

      BuildContainerCreated(testJob).asCallback(function (err) {
        if (err) { return done(err) }
        sinon.assert.calledOnce(ContextVersion.updateAsync)
        sinon.assert.calledWith(ContextVersion.updateAsync, {
          'build._id': testCvBuildId,
          state: ContextVersion.states.buildStarting
        }, sinon.match({
          $set: {
            'state': ContextVersion.states.buildStarted
          }
        }, { multi: true }))

        done()
      })
    })

    it('should error if no cv updated', function (done) {
      ContextVersion.updateAsync.returns(0)
      ContextVersion.findAsync.returns([])

      BuildContainerCreated(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(WorkerStopError)
        expect(err.message).to.contain('ContextVersion was not updated')

        done()
      })
    })

    it('should emit event on all returned', function (done) {
      var testCv1 = { some: 'value', toJSON: noop }
      var testCv2 = { some: 'otherValue', toJSON: noop }
      ContextVersion.updateAsync.returns(1)
      messenger.emitContextVersionUpdate.returns()
      ContextVersion.findAsync.returns([testCv1, testCv2])

      BuildContainerCreated(testJob).asCallback(function (err) {
        if (err) { return done(err) }

        sinon.assert.calledOnce(ContextVersion.findAsync)
        sinon.assert.calledWith(ContextVersion.findAsync, {
          'build._id': testCvBuildId,
          'state': ContextVersion.states.buildStarted
        })

        sinon.assert.calledTwice(messenger.emitContextVersionUpdate)
        sinon.assert.calledWith(messenger.emitContextVersionUpdate, testCv1, 'build_running')
        sinon.assert.calledWith(messenger.emitContextVersionUpdate, testCv2, 'build_running')

        sinon.assert.calledOnce(InstanceService.emitInstanceUpdateByCvBuildId)
        sinon.assert.calledWith(InstanceService.emitInstanceUpdateByCvBuildId, testCvBuildId, 'build_running')
        done()
      })
    })

    it('should emit nothing', function (done) {
      ContextVersion.updateAsync.returns(1)
      messenger.emitContextVersionUpdate.returns()
      ContextVersion.findAsync.returns([])

      BuildContainerCreated(testJob).asCallback(function (err) {
        if (err) { return done(err) }

        sinon.assert.calledOnce(ContextVersion.findAsync)
        sinon.assert.calledWith(ContextVersion.findAsync, {
          'build._id': testCvBuildId,
          'state': ContextVersion.states.buildStarted
        })

        sinon.assert.notCalled(messenger.emitContextVersionUpdate)
        done()
      })
    })
  }) // end valid job
}) // end build.container.started unit test
