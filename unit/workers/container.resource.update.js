/**
 * @module unit/workers/container.resource.update
 */
'use strict'

var clone = require('101/clone')
var Code = require('code')
var Lab = require('lab')
var Promise = require('bluebird')
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

var ContainerImageBuilderCreated = require('workers/container.resource.update')
var Docker = require('models/apis/docker')

var lab = exports.lab = Lab.script()

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('container.resource.update unit test', function () {
  var testId = 'adsfasdf'
  var testMem = 1234
  var testJobData = {
    containerId: testId,
    memoryInBytes: testMem
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
      testJob.memoryInBytes = 'asdf'

      ContainerImageBuilderCreated(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.data.err.message).to.match(/memoryInBytes.*must be a number/)
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

    it('should throw if containerId is a number', function (done) {
      testJob.containerId = 123445

      ContainerImageBuilderCreated(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.data.err.message).to.match(/containerId.*must be a string/)
        done()
      })
    })
  }) // end job validation

  describe('valid jobs', function () {
    beforeEach(function (done) {
      sinon.stub(Docker.prototype, 'updateContainerMemoryAsync')
      done()
    })

    afterEach(function (done) {
      Docker.prototype.updateContainerMemoryAsync.restore()
      done()
    })

    it('should update container memory', function (done) {
      Docker.prototype.updateContainerMemoryAsync.returns(Promise.resolve())
      ContainerImageBuilderCreated(testJob).asCallback(function (err) {
        if (err) { return done(err) }
        sinon.assert.calledOnce(Docker.prototype.updateContainerMemoryAsync)
        sinon.assert.calledWith(Docker.prototype.updateContainerMemoryAsync, testId, testMem)
        done()
      })
    })

    it('should TaskFatalError if 404', function (done) {
      Docker.prototype.updateContainerMemoryAsync.returns(Promise.reject({
        output: {
          statusCode: 404
        }
      }))
      ContainerImageBuilderCreated(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        sinon.assert.calledOnce(Docker.prototype.updateContainerMemoryAsync)
        sinon.assert.calledWith(Docker.prototype.updateContainerMemoryAsync, testId, testMem)
        done()
      })
    })
  }) // end valid jobs
}) // end container.resource.update unit test
