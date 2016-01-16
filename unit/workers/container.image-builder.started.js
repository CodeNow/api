/**
 * @module unit/workers/container.image-builder.started
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var clone = require('101/clone')
var Code = require('code')
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

var ContainerImageBuilderCreated = require('workers/container.image-builder.started')
var ContextVersion = require('models/mongo/context-version')
var messenger = require('socket/messenger')

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('container.image-builder.started unit test', function () {
  var testCvId = 'dat_cv_id'
  var testJobData = {
    host: 'http://10.0.0.1:4242',
    inspectData: {
      Id: 'someContainerId',
      Config: {
        Labels: {
          'contextVersion.id': testCvId
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
    it('should throw if missing contextVersion.id', function (done) {
      delete testJob.inspectData.Config.Labels['contextVersion.id']

      ContainerImageBuilderCreated(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.message).to.match(/contextVersion.id.*required/)
        done()
      })
    })
  }) // end job validation

  describe('valid job', function () {
    beforeEach(function (done) {
      sinon.stub(ContextVersion, 'findOneAndUpdate')
      sinon.stub(messenger, 'emitContextVersionUpdate')
      done()
    })

    afterEach(function (done) {
      ContextVersion.findOneAndUpdate.restore()
      messenger.emitContextVersionUpdate.restore()
      done()
    })

    it('should call correct query', function (done) {
      ContextVersion.findOneAndUpdate.yieldsAsync(null, {some: 'value'})

      ContainerImageBuilderCreated(testJob).asCallback(function (err) {
        if (err) { return done(err) }
        sinon.assert.calledOnce(ContextVersion.findOneAndUpdate)
        sinon.assert.calledWith(ContextVersion.findOneAndUpdate, {
          _id: testCvId,
          state: 'build starting'
        }, sinon.match({
          $set: {
            'state': 'build started'
          }
        }))
        done()
      })
    })

    it('should error if no cv updated', function (done) {
      ContextVersion.findOneAndUpdate.yieldsAsync()

      ContainerImageBuilderCreated(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.message).to.contain('ContextVersion was not updated')

        sinon.assert.calledOnce(ContextVersion.findOneAndUpdate)
        sinon.assert.calledWith(ContextVersion.findOneAndUpdate, {
          _id: testCvId,
          state: 'build starting'
        }, sinon.match({
          $set: {
            'state': 'build started'
          }
        }))
        done()
      })
    })

    it('should emit event on success', function (done) {
      var testCv = { some: 'value' }
      ContextVersion.findOneAndUpdate.yieldsAsync(null, testCv)
      messenger.emitContextVersionUpdate.returns()

      ContainerImageBuilderCreated(testJob).asCallback(function (err) {
        if (err) { return done(err) }

        sinon.assert.calledOnce(messenger.emitContextVersionUpdate)
        sinon.assert.calledWith(messenger.emitContextVersionUpdate, testCv, 'build_running')
        done()
      })
    })
  }) // end valid job
}) // end container.image-builder.started unit test
