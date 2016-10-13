'use strict'
require('loadenv')()

const keypather = require('keypather')()
const WorkerStopError = require('error-cat/errors/worker-stop-error')

const Instance = require('models/mongo/instance')
const InstanceService = require('models/services/instance-service')
const workerUtils = require('utils/worker-utils')
const schemas = require('models/rabbitmq/schemas')

module.exports.jobSchema = schemas.instanceStarted

/**
 * @param {Object} job - Job object
 * @returns {Promise}
 * @resolve {undefined} this promise will not return anything
 */
module.exports.task = (job) => {
  return Instance.findByIdAsync(job.id)
    .tap(workerUtils.assertFound(job, 'Instance'))
    .tap(function assertStarted (instance) {
      const status = keypather.get(instance, 'container.inspect.State.Status')
      if (status !== 'running') {
        throw new WorkerStopError('Instance is not running')
      }
    })
    .then(function (instance) {
      return InstanceService.emitInstanceUpdate(instance, null, 'start')
    })
    .return(undefined)
}
