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
  var testType = 'image-builder-container'
  var baseJob = {
    inspectData: {
      Config: {
        Labels: {
          'contextVersion.build._id': testCvId,
          'type': testType
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
      sinon.stub(rabbitMQ, 'publishContainerImageBuilderStarted')
      done()
    })

    afterEach(function (done) {
      rabbitMQ.publishContainerImageBuilderStarted.restore()
      done()
    })

    it('should create image-builder job is correct type', function (done) {
      rabbitMQ.publishContainerImageBuilderStarted.returns()

      ContainerLifeCycleStarted(testJob).asCallback(function (err) {
        if (err) { return done(err) }

        sinon.assert.calledOnce(rabbitMQ.publishContainerImageBuilderStarted)
        sinon.assert.calledWith(rabbitMQ.publishContainerImageBuilderStarted, testJob)
        done()
      })
    })

    it('should do nothing if unknown type', function (done) {
      testJob.inspectData.Config.Labels.type = 'unknown'

      ContainerLifeCycleStarted(testJob).asCallback(function (err) {
        if (err) { return done(err) }

        sinon.assert.notCalled(rabbitMQ.publishContainerImageBuilderStarted)
        done()
      })
    })

    it('should do nothing if empty job', function (done) {
      testJob = 'unknown'

      ContainerLifeCycleStarted(testJob).asCallback(function (err) {
        if (err) { return done(err) }

        sinon.assert.notCalled(rabbitMQ.publishContainerImageBuilderStarted)
        done()
      })
    })
  }) // end valid job
}) // end container.life-cycle.started unit test
