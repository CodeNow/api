/**
 * @module unit/workers/container.resource.clear
 */
'use strict'

var clone = require('101/clone')
var Code = require('code')
var Lab = require('lab')
var Promise = require('bluebird')
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

var ContainerResourceClear = require('workers/container.resource.clear')
var Docker = require('models/apis/docker')

var lab = exports.lab = Lab.script()

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('container.resource.clear unit test', function () {
  var testId = 'adsfasdf'
  var testJobData = {
    containerId: testId
  }
  var testJob

  beforeEach(function (done) {
    testJob = clone(testJobData)
    done()
  })

  describe('job validation', function () {
    it('should throw if missing containerId', function (done) {
      delete testJob.containerId

      ContainerResourceClear(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.data.err.message).to.match(/containerId.*required/)
        done()
      })
    })

    it('should throw if containerId is a number', function (done) {
      testJob.containerId = 123445

      ContainerResourceClear(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.data.err.message).to.match(/containerId.*must be a string/)
        done()
      })
    })
  }) // end job validation

  describe('valid jobs', function () {
    beforeEach(function (done) {
      sinon.stub(Docker.prototype, 'clearContainerMemoryAsync')
      done()
    })

    afterEach(function (done) {
      Docker.prototype.clearContainerMemoryAsync.restore()
      done()
    })

    it('should update container memory', function (done) {
      Docker.prototype.clearContainerMemoryAsync.returns(Promise.resolve())
      ContainerResourceClear(testJob).asCallback(function (err) {
        if (err) { return done(err) }
        sinon.assert.calledOnce(Docker.prototype.clearContainerMemoryAsync)
        sinon.assert.calledWith(Docker.prototype.clearContainerMemoryAsync, testId)
        done()
      })
    })

    it('should TaskFatalError if 404', function (done) {
      Docker.prototype.clearContainerMemoryAsync.returns(Promise.reject({
        output: {
          statusCode: 404
        }
      }))
      ContainerResourceClear(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        sinon.assert.calledOnce(Docker.prototype.clearContainerMemoryAsync)
        sinon.assert.calledWith(Docker.prototype.clearContainerMemoryAsync, testId)
        done()
      })
    })
  }) // end valid jobs
}) // end container.resource.clear unit test
