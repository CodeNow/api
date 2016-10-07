/**
 * Start instance.
 * @module lib/workers/instance.start
 */
'use strict'
require('loadenv')()
const keypather = require('keypather')()
const moment = require('moment')
const Promise = require('bluebird')
const WorkerError = require('error-cat/errors/worker-error')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

const Docker = require('models/apis/docker')
const Instance = require('models/mongo/instance')
const InstanceService = require('models/services/instance-service')
const joi = require('utils/joi')
const logger = require('logger')
const rabbitMQ = require('models/rabbitmq')

module.exports.jobSchema = joi.object({
  instanceId: joi.string().required(),
  containerId: joi.string().required(),
  sessionUserGithubId: joi.number().required(),
  tid: joi.string()
}).required().label('instance.start job')

/** @type {Number} max 98% of all create calls to date 09-2016 */
module.exports.msTimeout = 5000

/** @type {Number} user should see container created within 10 min */
module.exports.maxNumRetries = 8

module.exports.finalRetryFn = Promise.method(function (job) {
  rabbitMQ.instanceContainerErrored({
    instanceId: job.instanceId,
    containerId: job.containerId,
    error: 'Could not start instance, retry limit reached'
  })
})

/**
 * Handle instance.start command
 * Flow is following:
 * 1. find starting instance if still exists
 * 2. send `starting` event to the frontend
 * 3. call docker start
 * @param {Object} job - Job info
 * @returns {Promise}
 * @resolve {undefined} this promise will not return anything
 */
module.exports.task = function InstanceStartWorker (job) {
  const log = logger.child({ method: 'InstanceStartWorker' })
  return Instance.findOneStarting(job.instanceId, job.containerId)
    .tap(function (instance) {
      log.trace('emit frontend updates')
      return InstanceService.emitInstanceUpdate(instance, job.sessionUserGithubId, 'starting')
    })
    .tap(function (instance) {
      log.trace('docker start command')
      const docker = new Docker()
      return docker.startContainerAsync(job.containerId)
        .catch(function (err) {
          // Swarm sometimes does not know about a container when it has been created.
          // This is because Docker listener emits container created before swarm updates internal state
          // If we get a 404 we need to ensure this is not because swarm has not updated its state yet.
          // We check the created date of the container, if longer then 5 min, its safe to task fatal
          if (keypather.get(err, 'output.statusCode') === 404) {
            const created = keypather.get(instance, 'container.inspect.Created')
            if (created && moment(created).isBefore(moment().subtract(5, 'minutes'))) {
              throw new WorkerStopError(
                'Sorry, your container got lost. Please rebuild without cache',
                { job: job })
            }

            throw new WorkerError(
              'container does not exist',
              { job: job, err: err }
            )
          }
          throw err
        })
    })
    .catch(Instance.NotFoundError, function (err) {
      throw new WorkerStopError(err.message, { job: job, err: err })
    })
    .catch(WorkerStopError, function (err) {
      rabbitMQ.instanceContainerErrored({
        instanceId: job.instanceId,
        containerId: job.containerId,
        error: err.message
      })

      throw err
    })
    .catch(Instance.IncorrectStateError, function (err) {
      throw new WorkerStopError(err.message, { job: job, err: err })
    })
    .return()
}
