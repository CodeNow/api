/**
 * @module unit/workers/container.resource.update
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var clone = require('101/clone')
var Code = require('code')
var noop = require('101/noop')
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

var ContainerImageBuilderCreated = require('workers/container.resource.update')
var ContextVersion = require('models/mongo/context-version')
var messenger = require('socket/messenger')

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('container.resource.update unit test', function () {
  var testCvBuildId = 'dat_cv_id'
  var testJobData = {
    containerId: 'adsfasdf',
    memoryInBytes: 12345
  }
  var testJob

  beforeEach(function (done) {
    testJob = clone(testJobData)
    done()
  })

  describe('job validation', function () {
    it('should throw if missing memoryInBytes', function (done) {
      delete testJob.memoryInBytes

      ContainerImageBuilderCreated(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.data.err.message).to.match(/memoryInBytes.*required/)
        done()
      })
    })

    it('should throw if memoryInBytes is a string', function (done) {
      testJob.memoryInBytes = '123123'

      ContainerImageBuilderCreated(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.data.err.message).to.match(/memoryInBytes.*required/)
        done()
      })
    })

    it('should throw if missing containerId', function (done) {
      delete testJob.containerId

      ContainerImageBuilderCreated(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.data.err.message).to.match(/containerId.*required/)
        done()
      })
    })
  }) // end job validation
}) // end container.resource.update unit test
