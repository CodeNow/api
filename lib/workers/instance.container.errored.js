/**
 * instance container error
 * @module lib/workers/instance.container.errored
 */
'use strict'

require('loadenv')()
var WorkerStopError = require('error-cat/errors/worker-stop-error')

var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var joi = require('utils/joi')
var keypather = require('keypather')()
var logger = require('middlewares/logger')(__filename).log
var workerUtils = require('utils/worker-utils')

module.exports = InstanceContainerErrored

var schema = joi.object({
  instanceId: joi.string().required(),
  containerId: joi.string().required(),
  error: joi.string().required(),
  tid: joi.string()
}).required().label('instance.container.errored job')

var queueName = 'instance.container.errored'

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
    queue: queueName,
    job: job,
    tx: true
  })
  log.info('instance.container.errored - start')
  return workerUtils.validateJob(job, schema)
    .then(function () {
      return Instance.setContainerError(job.instanceId, job.containerId, job.error)
        .catch(function (err) {
          if (keypather.get(err, 'output.statusCode') === 404) {
            log.trace('setContainerError did not find instance')
            throw new WorkerStopError(
              'Instance not found',
              { report: false, job: job }
            )
          }
        })
    })
    .tap(function (instance) {
      return InstanceService.emitInstanceUpdate(instance, null, 'errored', false)
    })
    .return(null)
}
