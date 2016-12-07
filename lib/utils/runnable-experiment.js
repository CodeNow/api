'use strict'

require('loadenv')()

var Experiment = require('node-scientist').Experiment
var find = require('101/find')
var hasProperties = require('101/has-properties')
var util = require('util')
var pick = require('101/pick')
var Promise = require('bluebird')

var datadog = require('models/datadog')
var log = require('middlewares/logger')(__filename).log

function RunnableExperiment (name) {
  Experiment.call(this, name)
}
util.inherits(RunnableExperiment, Experiment)

/**
 * Publisher function. Takes a result, must return a Promise.
 * @param {Result} result Result object from Scientist.
 * @return {Promise} Promise resolved when publishing is done.
 */
RunnableExperiment.prototype.publish = function (result) {
  log.info('RunnableExperiment#publish')
  var control = find(result.observations, hasProperties({ name: 'control' }))
  var candidate = find(result.observations, hasProperties({ name: 'candidate' }))
  var observationFilters = ['value', 'exception', 'duration']

  var safeName = result.experiment_name().replace('.', '-').replace(':', '-')
  var baseName = 'scientist.' + safeName + '.'
  var tags = ['env:' + process.env.NODE_ENV]

  // increment the count of the experiment runs
  datadog.increment(baseName + 'count', tags)
  // report the durations for both the control and candidate
  datadog.timing(baseName + 'control.time', control.duration)
  datadog.timing(baseName + 'candidate.time', candidate.duration)

  if (result.mismatched()) {
    log.debug({
      context: result.context(),
      candidate: pick(candidate, observationFilters),
      control: pick(control, observationFilters)
    }, 'RunnableExperiment ' + safeName + ' mismatched.')
    datadog.increment(baseName + 'mismatched', tags)
  }
  if (result.ignored()) {
    log.debug({
      context: result.context(),
      candidate: pick(candidate, observationFilters),
      control: pick(control, observationFilters)
    }, 'RunnableExperiment ' + safeName + ' ignored.')
    datadog.increment(baseName + 'ignored', tags)
  }
  return Promise.resolve(true)
}

module.exports = RunnableExperiment
