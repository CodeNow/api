/**
 * instance container error
 * @module lib/workers/application.container.errored
 */
'use strict'

require('loadenv')()
const WorkerStopError = require('error-cat/errors/worker-stop-error')

const Instance = require('models/mongo/instance')
const InstanceService = require('models/services/instance-service')
const joi = require('utils/joi')
const keypather = require('keypather')()
const logger = require('middlewares/logger')(__filename).log

module.exports.jobSchema = joi.object({
  instanceId: joi.string().required(),
  containerId: joi.string().required(),
  error: joi.string().required()
}).unknown().required()

/**
 * Handle application.container.errored command
 * Flow is following:
 * 1. validate inputs
 * 2. set error
 * 3. send `errored` event to the frontend
 * @param {Object} job - Job info
 * @returns {Promise}
 * @resolve {undefined} this promise will not return anything
 */
module.exports.task = (job) => {
  const log = logger.child({ method: 'ApplicationContainerErrored' })
  return Instance.setContainerError(job.instanceId, job.containerId, job.error)
    .catch(function (err) {
      if (keypather.get(err, 'output.statusCode') === 404) {
        log.trace('setContainerError did not find instance')
        throw new WorkerStopError(
          'Instance not found',
          { job: job }, { level: 'info' }
        )
      }
    })
    .tap(function (instance) {
      return InstanceService.emitInstanceUpdate(instance, null, 'errored')
    })
    .return(null)
}
