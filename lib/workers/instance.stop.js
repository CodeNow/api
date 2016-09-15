/**
 * Stop instance.
 * @module lib/workers/instance.stop
 */
'use strict'

require('loadenv')()

var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var joi = require('utils/joi')
var keypather = require('keypather')()
var logger = require('logger')
var WorkerStopError = require('error-cat/errors/worker-stop-error')
var workerUtils = require('utils/worker-utils')
var Docker = require('models/apis/docker')
var rabbitMQ = require('models/rabbitmq')

module.exports.jobSchema = joi.object({
  instanceId: joi.string().required(),
  containerId: joi.string().required(),
  sessionUserGithubId: joi.number().required()
}).unknown().required().label('instance.stop job')

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
  var log = logger.child({ method: 'InstanceStopWorker' })
  return Instance.findOneStoppingAsync(job.instanceId, job.containerId)
    .tap(workerUtils.assertFound(job, 'Instance'))
    .tap(function (instance) {
      log.trace('emit frontend updates')
      return InstanceService.emitInstanceUpdate(instance, job.sessionUserGithubId, 'stopping', true)
    })
    .then(function (instance) {
      log.trace('docker stop command')
      var docker = new Docker()
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
