/**
 * @module unit/workers/image-builder.container.created
 */
'use strict'
require('sinon-as-promised')(require('bluebird'))
var Boom = require('dat-middleware').Boom
var clone = require('101/clone')
var Code = require('code')
var Lab = require('lab')
var moment = require('moment')
var noop = require('101/noop')
var sinon = require('sinon')
var WorkerError = require('error-cat/errors/worker-error')
var WorkerStopError = require('error-cat/errors/worker-stop-error')

var ContextVersion = require('models/mongo/context-version')
var Docker = require('models/apis/docker')
var InstanceService = require('models/services/instance-service')
var messenger = require('socket/messenger')
var Worker = require('workers/image-builder.container.created')

var lab = exports.lab = Lab.script()

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('ImageBuilderContainerCreated', function () {
  describe('task', function () {
    var testCvBuildId = 'dat_cv_id'
    var testContainerId = 'someContainerId'
    var testDockerTag = 'thatTagDoh'
    var testJobData = {
      host: 'http://10.0.0.1:4242',
      inspectData: {
        Id: testContainerId,
        Created: moment().format(),
        Config: {
          Labels: {
            'contextVersion.build._id': testCvBuildId,
            'dockerTag': testDockerTag
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
        sinon.stub(messenger, 'emitContextVersionUpdate')
        sinon.stub(Docker.prototype, 'startContainerAsync').resolves()
        sinon.stub(InstanceService, 'emitInstanceUpdateByCvBuildId')
        done()
      })

      afterEach(function (done) {
        ContextVersion.updateAsync.restore()
        ContextVersion.findAsync.restore()
        messenger.emitContextVersionUpdate.restore()
        Docker.prototype.startContainerAsync.restore()
        InstanceService.emitInstanceUpdateByCvBuildId.restore()
        done()
      })

      it('should call update correctly', function (done) {
        ContextVersion.updateAsync.returns(1)
        ContextVersion.findAsync.returns([])

        Worker.task(testJob).asCallback(function (err) {
          if (err) { return done(err) }
          sinon.assert.calledOnce(ContextVersion.updateAsync)
          sinon.assert.calledWith(ContextVersion.updateAsync, {
            'build._id': testCvBuildId,
            'build.finished': {
              $exists: false
            },
            'build.started': {
              $exists: true
            },
            state: { $ne: ContextVersion.states.buildStarted }
          }, {
            $set: {
              state: ContextVersion.states.buildStarting,
              dockerHost: testJob.host,
              'build.dockerContainer': testContainerId,
              'build.dockerTag': testDockerTag
            }
          }, { multi: true })

          done()
        })
      })

      it('should error if no cv updated', function (done) {
        ContextVersion.updateAsync.returns(0)

        Worker.task(testJob).asCallback(function (err) {
          expect(err).to.be.an.instanceof(WorkerStopError)
          expect(err.message).to.contain('no valid ContextVersion found to start')

          done()
        })
      })

      it('should fatal error if no container and created was more than 5 minutes ago', function (done) {
        testJob.inspectData.Created = moment().subtract(6, 'minutes').format()
        Docker.prototype.startContainerAsync.rejects(Boom.create(404, 'b'))
        Worker.task(testJob).asCallback(function (err) {
          expect(err).to.be.an.instanceof(WorkerStopError)
          expect(err.message).to.match(/after 5 minutes/)
          done()
        })
      })

      it('should error if no container and created was less than 5 minutes ago', function (done) {
        Docker.prototype.startContainerAsync.rejects(Boom.create(404, 'b'))
        Worker.task(testJob).asCallback(function (err) {
          expect(err).to.be.an.instanceof(WorkerError)
          expect(err.message).to.match(/not exist/)
          done()
        })
      })

      it('should start container', function (done) {
        ContextVersion.updateAsync.returns(1)
        ContextVersion.findAsync.returns([])

        Worker.task(testJob).asCallback(function (err) {
          if (err) { return done(err) }

          sinon.assert.calledOnce(Docker.prototype.startContainerAsync)
          sinon.assert.calledWith(Docker.prototype.startContainerAsync, testContainerId)
          done()
        })
      })

      it('should emit build_started for each cv', function (done) {
        var cv1 = { cv: 1, toJSON: noop }
        var cv2 = { cv: 2, toJSON: noop }
        ContextVersion.updateAsync.returns(1)
        ContextVersion.findAsync.returns([cv1, cv2])
        messenger.emitContextVersionUpdate.returns()

        Worker.task(testJob).asCallback(function (err) {
          if (err) { return done(err) }

          sinon.assert.calledOnce(Docker.prototype.startContainerAsync)
          sinon.assert.calledWith(Docker.prototype.startContainerAsync, testContainerId)

          sinon.assert.calledOnce(ContextVersion.findAsync)
          sinon.assert.calledWith(ContextVersion.findAsync, {
            'build._id': testCvBuildId,
            'state': ContextVersion.states.buildStarting
          })

          sinon.assert.calledTwice(messenger.emitContextVersionUpdate)
          sinon.assert.calledWith(messenger.emitContextVersionUpdate, cv1, 'build_started')
          sinon.assert.calledWith(messenger.emitContextVersionUpdate, cv2, 'build_started')

          sinon.assert.calledOnce(InstanceService.emitInstanceUpdateByCvBuildId)
          sinon.assert.calledWith(InstanceService.emitInstanceUpdateByCvBuildId, testCvBuildId, 'build_started')

          done()
        })
      })
    }) // end valid job
  }) // end task
}) // end Worker
