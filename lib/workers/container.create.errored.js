/**
 * Responds to container create errors
 *
 * @module lib/workers/container.create.errored
 */
'use strict'
require('loadenv')()

var keypather = require('keypather')()
var monitor = require('monitor-dog')
var put = require('101/put')
var TaskFatalError = require('ponos').TaskFatalError

var error = require('error')
var joi = require('joi')
var log = require('middlewares/logger')(__filename).log

module.exports = containerCreateErrored

/**
 * reports constraint errors only if it is valid
 * @param  {Object} job worker job
 * @return {Promise} worker task promise
 */
function containerCreateErrored (job) {
  var logData = {
    tx: true,
    job: job
  }

  var schema = joi.object({
    err: joi.object({
      createOpts: joi.object()
    }).unknown().required()
  }).unknown().required().label('Job')

  return joi.try(function () {
    joi.assert(job, schema)
  })
  .catch(function (err) {
    throw new TaskFatalError(
      'container.create.errored',
      'validation failed',
      { job: job, err: err }
    )
  })
  .then(function () {
    var opts = job.createOpts
    var err = job.err
    log.info(logData, 'containerCreateErrored')
    var isConstraintFailure = !!~err.message.indexOf('unable to find a node that satisfies')
    if (isConstraintFailure) {
      keypather.set(err, 'data.level', 'critical')
      log.error(put(logData, { org: opts.Labels['com.docker.swarm.constraints'] }), '_handleCreateContainerError unable to find dock for org')
      monitor.event({
        title: 'No dock created for org: ' + opts.Labels['com.docker.swarm.constraints'],
        text: 'No dock create for org info: ' + JSON.stringify(opts),
        alert_type: 'error'
      })
      // Report error to Rollbar
      error.log(err)
    }
    var isOutOfResources = !!~err.message.indexOf('no resources available to schedule')
    if (isOutOfResources) {
      // report critical error to rollbar so we can trigger pagerduty for now
      keypather.set(err, 'data.level', 'critical')
      log.error(put(logData, {
        err: err,
        Memory: opts.Memory
      }), '_handleCreateContainerError unable to find dock with required resources')
      monitor.event({
        title: 'out of dock resources for org: ' + opts.Labels['com.docker.swarm.constraints'],
        text: 'out of resources info: ' + JSON.stringify(opts),
        alert_type: 'error'
      })
      error.log(err, 'out of dock resources')
    }
  })
}
