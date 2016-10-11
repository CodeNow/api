/**
 * Stop instance.
 * @module lib/workers/instance.stop
 */
'use strict'
require('loadenv')()
const keypather = require('keypather')()
const Promise = require('bluebird')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

const Docker = require('models/apis/docker')
const Instance = require('models/mongo/instance')
const InstanceService = require('models/services/instance-service')
const joi = require('utils/joi')
const logger = require('logger')
const rabbitMQ = require('models/rabbitmq')
const workerUtils = require('utils/worker-utils')

module.exports.jobSchema = joi.object({
  instanceId: joi.string().required(),
  containerId: joi.string().required(),
  sessionUserGithubId: joi.number().required()
}).unknown().required().label('instance.stop job')

/** @type {Number} max 98% of all stop calls to date 09-2016 */
module.exports.msTimeout = 10000

/** @type {Number} user should see container stopped within 10 min */
module.exports.maxNumRetries = 8

module.exports.finalRetryFn = Promise.method(function (job) {
  rabbitMQ.instanceContainerErrored({
    instanceId: job.instanceId,
    containerId: job.containerId,
    error: 'Could not stop instance, retry limit reached'
  })
})

/**
 * Handle instance.stop command
 * Flow is following:
 * 1. find stopping instance if still exists
 * 2. send `stopping` event to the frontend
 * 3. call docker stop
 * @param {Object} job - Job info
 * @returns {Promise}
 * @resolve {undefined} this promise will not return anything
 */
module.exports.task = function InstanceStopWorker (job) {
  const log = logger.child({ method: 'InstanceStopWorker' })
  return Instance.findOneStoppingAsync(job.instanceId, job.containerId)
    .tap(workerUtils.assertFound(job, 'Instance'))
    .tap(function (instance) {
      log.trace('emit frontend updates')
      return InstanceService.emitInstanceUpdate(instance, job.sessionUserGithubId, 'stopping')
    })
    .then(function (instance) {
      log.trace('docker stop command')
      const docker = new Docker()
      return docker.stopContainerAsync(job.containerId, true)
        .catch(function (err) {
          if (keypather.get(err, 'output.statusCode') === 404) {
            throw new WorkerStopError(
              'Sorry, your container got lost. Please rebuild without cache',
              { job: job, err: err }
            )
          }
          throw err
        })
        .catch(WorkerStopError, function (err) {
          rabbitMQ.instanceContainerErrored({
            instanceId: job.instanceId,
            containerId: job.containerId,
            error: err.message
          })

          throw err
        })
    })
}
