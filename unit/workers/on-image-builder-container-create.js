/**
 * @module unit/workers/on-image-builder-container-create
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var clone = require('101/clone')
var Code = require('code')
var path = require('path')
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

var ContextVersion = require('models/mongo/context-version')
var Docker = require('models/apis/docker')
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
        expect(err.message).to.match(/host.*required/)
        done()
      })
    })

    it('should throw if missing Id', function (done) {
      delete testJob.inspectData.Id

      OnImageBuilderContainerCreate(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.message).to.match(/Id.*required/)
        done()
      })
    })

    it('should throw if missing contextVersion.build._id', function (done) {
      delete testJob.inspectData.Config.Labels['contextVersion.build._id']

      OnImageBuilderContainerCreate(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.message).to.match(/contextVersion.build._id.*required/)
        done()
      })
    })
  }) // end job validation

  describe('valid job', function () {
    beforeEach(function (done) {
      sinon.stub(ContextVersion, 'updateAsync')
      sinon.stub(Docker.prototype, 'startImageBuilderContainerAsync')
      done()
    })

    afterEach(function (done) {
      ContextVersion.updateAsync.restore()
      Docker.prototype.startImageBuilderContainerAsync.restore()
      done()
    })

    it('should call update correctly', function (done) {
      ContextVersion.updateAsync.returns(1)

      OnImageBuilderContainerCreate(testJob).asCallback(function (err) {
        if (err) { return done(err) }
        sinon.assert.calledOnce(ContextVersion.updateAsync)
        sinon.assert.calledWith(ContextVersion.updateAsync, {
          'build._id': testCvBuildId,
          'build.finished': false,
          'build.started': true,
          state: { $ne: 'build started' }
        }, {
          $set: {
            state: 'build starting',
            dockerHost: testJob.host
          }
        }, { multi: true })

        done()
      })
    })

    it('should error if no cv updated', function (done) {
      ContextVersion.updateAsync.returns(0)

      OnImageBuilderContainerCreate(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.message).to.contain('no valid ContextVersion found to start')

        done()
      })
    })

    it('should start container', function (done) {
      ContextVersion.updateAsync.returns(1)
      Docker.prototype.startImageBuilderContainerAsync.returns()

      OnImageBuilderContainerCreate(testJob).asCallback(function (err) {
        if (err) { return done(err) }

        sinon.assert.calledOnce(Docker.prototype.startImageBuilderContainerAsync)
        sinon.assert.calledWith(Docker.prototype.startImageBuilderContainerAsync, testContainerId)
        done()
      })
    })
  }) // end valid job
}) // end OnImageBuilderContainerCreate
