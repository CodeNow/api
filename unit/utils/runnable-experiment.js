'use strict'

var Code = require('code')
var Lab = require('lab')
var sinon = require('sinon')

var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var expect = Code.expect
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach

var datadog = require('models/datadog')
var Experiment = require('node-scientist').Experiment

var RunnableExperiment = require('utils/runnable-experiment')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)
describe('RunnableExperiment: ' + moduleName, function () {
  var experiment
  var mockResult
  beforeEach(function (done) {
    experiment = new RunnableExperiment('testing')
    mockResult = {
      observations: [{
        name: 'control',
        duration: 1,
        value: 4,
        exception: new Error('foo')
      }, {
        name: 'candidate',
        duration: 2,
        value: 5,
        exception: new Error('bar')
      }],
      context: sinon.stub().returns({}),
      experiment_name: sinon.stub().returns('testing'),
      mismatched: sinon.stub().returns(false),
      ignored: sinon.stub().returns(false)
    }
    done()
  })

  it('should return a RunnableExperiment, extending Scientist Experiment', function (done) {
    expect(experiment).to.be.an.instanceOf(RunnableExperiment)
    expect(experiment).to.be.an.instanceOf(Experiment)
    done()
  })

  describe('#publish', function (done) {
    beforeEach(function (done) {
      sinon.stub(datadog, 'histogram')
      sinon.stub(datadog, 'increment')
      sinon.stub(datadog, 'timing')
      done()
    })
    afterEach(function (done) {
      datadog.histogram.restore()
      datadog.increment.restore()
      datadog.timing.restore()
      done()
    })

    it('should report a count to datadog', function (done) {
      experiment.publish(mockResult)
        .then(function () {
          sinon.assert.calledOnce(datadog.increment)
          sinon.assert.calledWithExactly(
            datadog.increment,
            'scientist.testing.count',
            sinon.match.array
          )
          done()
        })
        .catch(done)
    })

    it('should send appropriate tags', function (done) {
      experiment.publish(mockResult)
        .then(function () {
          sinon.assert.calledOnce(datadog.increment)
          sinon.assert.calledWithExactly(
            datadog.increment,
            sinon.match.string,
            ['env:test'] // from NODE_ENV
          )
          done()
        })
        .catch(done)
    })

    it('should report timing for the control and candidate', function (done) {
      experiment.publish(mockResult)
        .then(function () {
          sinon.assert.calledTwice(datadog.timing)
          sinon.assert.calledWithExactly(
            datadog.timing,
            'scientist.testing.control.time',
            1
          )
          sinon.assert.calledWithExactly(
            datadog.timing,
            'scientist.testing.candidate.time',
            2
          )
          done()
        })
        .catch(done)
    })

    it('should report if there were any mismatched values', function (done) {
      mockResult.mismatched.returns(true)
      experiment.publish(mockResult)
        .then(function () {
          sinon.assert.calledTwice(datadog.increment)
          sinon.assert.calledWithExactly(
            datadog.increment.secondCall,
            'scientist.testing.mismatched',
            sinon.match.array
          )
          done()
        })
        .catch(done)
    })

    it('should report if there were any ignored values', function (done) {
      mockResult.ignored.returns(true)
      experiment.publish(mockResult)
        .then(function () {
          sinon.assert.calledTwice(datadog.increment)
          sinon.assert.calledWithExactly(
            datadog.increment.secondCall,
            'scientist.testing.ignored',
            sinon.match.array
          )
          done()
        })
        .catch(done)
    })
  })
})
