/**
 * @module unit/workers/on-image-builder-container-create
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var clone = require('101/clone')
var Code = require('code')
var noop = require('101/noop')
var path = require('path')
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

var ContextVersion = require('models/mongo/context-version')
var Docker = require('models/apis/docker')
var messenger = require('socket/messenger')
var OnImageBuilderContainerCreate = require('workers/on-image-builder-container-create')

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var moduleName = path.relative(process.cwd(), __filename)

describe('OnImageBuilderContainerCreate: ' + moduleName, function () {
  var testCvBuildId = 'dat_cv_id'
  var testContainerId = 'someContainerId'
  var testJobData = {
    host: 'http://10.0.0.1:4242',
    inspectData: {
      Id: testContainerId,
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

  describe('job validation', function () {
    it('should throw if missing host', function (done) {
      delete testJob.host

      OnImageBuilderContainerCreate(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.data.err.message).to.match(/host.*required/)
        done()
      })
    })

    it('should throw if missing Id', function (done) {
      delete testJob.inspectData.Id

      OnImageBuilderContainerCreate(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.data.err.message).to.match(/Id.*required/)
        done()
      })
    })

    it('should throw if missing contextVersion.build._id', function (done) {
      delete testJob.inspectData.Config.Labels['contextVersion.build._id']

      OnImageBuilderContainerCreate(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.data.err.message).to.match(/contextVersion.build._id.*required/)
        done()
      })
    })
  }) // end job validation

  describe('valid job', function () {
    beforeEach(function (done) {
      sinon.stub(ContextVersion, 'setBuildStarting')
      sinon.stub(ContextVersion, 'findAsync')
      sinon.stub(messenger, 'emitContextVersionUpdate')
      sinon.stub(Docker.prototype, 'startImageBuilderContainerAsync')
      done()
    })

    afterEach(function (done) {
      ContextVersion.setBuildStarting.restore()
      ContextVersion.findAsync.restore()
      messenger.emitContextVersionUpdate.restore()
      Docker.prototype.startImageBuilderContainerAsync.restore()
      done()
    })

    it('should call update correctly', function (done) {
      ContextVersion.setBuildStarting.returns(1)
      ContextVersion.findAsync.returns([])

      OnImageBuilderContainerCreate(testJob).asCallback(function (err) {
        if (err) { return done(err) }
        sinon.assert.calledOnce(ContextVersion.setBuildStarting)
        sinon.assert.calledWith(ContextVersion.setBuildStarting, testCvBuildId, testJob.host)

        done()
      })
    })

    it('should error if no cv updated', function (done) {
      ContextVersion.setBuildStarting.returns(0)

      OnImageBuilderContainerCreate(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.message).to.contain('no valid ContextVersion found to start')

        done()
      })
    })

    it('should start container', function (done) {
      ContextVersion.setBuildStarting.returns(1)
      Docker.prototype.startImageBuilderContainerAsync.returns()
      ContextVersion.findAsync.returns([])

      OnImageBuilderContainerCreate(testJob).asCallback(function (err) {
        if (err) { return done(err) }

        sinon.assert.calledOnce(Docker.prototype.startImageBuilderContainerAsync)
        sinon.assert.calledWith(Docker.prototype.startImageBuilderContainerAsync, testContainerId)
        done()
      })
    })

    it('should emit build_started for each cv', function (done) {
      var cv1 = { cv: 1, toJSON: noop }
      var cv2 = { cv: 2, toJSON: noop }
      ContextVersion.setBuildStarting.returns(1)
      ContextVersion.findAsync.returns([cv1, cv2])
      Docker.prototype.startImageBuilderContainerAsync.returns()
      messenger.emitContextVersionUpdate.returns()

      OnImageBuilderContainerCreate(testJob).asCallback(function (err) {
        if (err) { return done(err) }

        sinon.assert.calledOnce(Docker.prototype.startImageBuilderContainerAsync)
        sinon.assert.calledWith(Docker.prototype.startImageBuilderContainerAsync, testContainerId)

        sinon.assert.calledOnce(ContextVersion.findAsync)
        sinon.assert.calledWith(ContextVersion.findAsync, {
          'build._id': testCvBuildId,
          'state': ContextVersion.states.buildStarting
        })

        sinon.assert.calledTwice(messenger.emitContextVersionUpdate)
        sinon.assert.calledWith(messenger.emitContextVersionUpdate, cv1, 'build_started')
        sinon.assert.calledWith(messenger.emitContextVersionUpdate, cv2, 'build_started')

        done()
      })
    })
  }) // end valid job
}) // end OnImageBuilderContainerCreate
