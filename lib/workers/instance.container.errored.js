/**
 * Start instance.
 * @module lib/workers/instance.container.errored
 */
'use strict'

require('loadenv')()

var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var joi = require('utils/joi')
var logger = require('middlewares/logger')(__filename).log
var TaskFatalError = require('ponos').TaskFatalError

module.exports = InstanceContainerErrored

var schema = joi.object({
  instanceId: joi.string().required(),
  containerId: joi.string().required(),
  error: joi.string().required(),
  tid: joi.string()
}).required().label('instance.container.errored job')

/**
 * Handle instance.container.errored command
 * Flow is following:
 * 1. validate inputs
 * 2. set error
 * 3. send `errored` event to the frontend
 * @param {Object} job - Job info
 * @returns {Promise}
 * @resolve {undefined} this promise will not return anything
 */
function InstanceContainerErrored (job) {
  var log = logger.child({
    queue: 'instance.container.errored',
    job: job,
    tx: true
  })
  log.info('instance.container.errored - start')
  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(
        'instance.container.errored',
        'Invalid Job',
        { validationError: err }
      )
    })
    .then(function () {
      return Instance.setContainerError(job.instanceId, job.containerId, job.error)
    })
    .tap(function (instance) {
      log.trace('setContainerError did not find instance')
      if (!instance) {
        throw new TaskFatalError(
          'instance.container.errored',
          'Instance not found',
          { report: false, job: job }
        )
      }
      return instance
    })
    .then(function (instance) {
      return InstanceService.emitInstanceUpdate(instance, null, 'errored', false)
    })
    .return(null)
}
