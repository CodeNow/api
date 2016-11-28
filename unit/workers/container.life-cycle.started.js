/**
 * @module unit/workers/container.life-cycle.started
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var clone = require('101/clone')
var sinon = require('sinon')

var ContainerLifeCycleStarted = require('workers/container.life-cycle.started')
var rabbitMQ = require('models/rabbitmq')

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var it = lab.it

describe('container.life-cycle.started unit test', function () {
  var testCvId = 'dat_cv_id'
  var baseJob = {
    inspectData: {
      Config: {
        Labels: {
          'contextVersion.build._id': testCvId,
          'type': ''
        }
      }
    }
  }
  var testJob

  beforeEach(function (done) {
    testJob = clone(baseJob)
    done()
  })

  describe('createNextJob', function () {
    beforeEach(function (done) {
      sinon.stub(rabbitMQ, 'publishInstanceContainerStarted')
      sinon.stub(rabbitMQ, 'publishContainerImageBuilderStarted')
      done()
    })

    afterEach(function (done) {
      rabbitMQ.publishContainerImageBuilderStarted.restore()
      rabbitMQ.publishInstanceContainerStarted.restore()
      done()
    })

    it('should create image-builder job is correct type', function (done) {
      testJob.inspectData.Config.Labels.type = 'image-builder-container'
      rabbitMQ.publishContainerImageBuilderStarted.returns()

      ContainerLifeCycleStarted.task(testJob).asCallback(function (err) {
        if (err) { return done(err) }

        sinon.assert.calledOnce(rabbitMQ.publishContainerImageBuilderStarted)
        sinon.assert.calledWith(rabbitMQ.publishContainerImageBuilderStarted, testJob)
        sinon.assert.notCalled(rabbitMQ.publishInstanceContainerStarted)
        done()
      })
    })

    it('should create user-container job is correct type', function (done) {
      testJob.inspectData.Config.Labels.type = 'user-container'
      rabbitMQ.publishContainerImageBuilderStarted.returns()

      ContainerLifeCycleStarted.task(testJob).asCallback(function (err) {
        if (err) { return done(err) }

        sinon.assert.calledOnce(rabbitMQ.publishInstanceContainerStarted)
        sinon.assert.calledWith(rabbitMQ.publishInstanceContainerStarted, testJob)
        sinon.assert.notCalled(rabbitMQ.publishContainerImageBuilderStarted)
        done()
      })
    })

    it('should do nothing if unknown type', function (done) {
      testJob.inspectData.Config.Labels.type = 'unknown'

      ContainerLifeCycleStarted.task(testJob).asCallback(function (err) {
        if (err) { return done(err) }

        sinon.assert.notCalled(rabbitMQ.publishContainerImageBuilderStarted)
        done()
      })
    })

    it('should do nothing if empty job', function (done) {
      testJob = 'unknown'

      ContainerLifeCycleStarted.task(testJob).asCallback(function (err) {
        if (err) { return done(err) }

        sinon.assert.notCalled(rabbitMQ.publishContainerImageBuilderStarted)
        done()
      })
    })
  }) // end valid job
}) // end container.life-cycle.started unit test
