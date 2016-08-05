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
var log = require('middlewares/logger')(__filename).log
var WorkerStopError = require('error-cat/errors/worker-stop-error')
var workerUtils = require('utils/worker-utils')
var Docker = require('models/apis/docker')
var rabbitMQ = require('models/rabbitmq')

module.exports = InstanceStopWorker

var schema = joi.object({
  instanceId: joi.string().required(),
  containerId: joi.string().required(),
  sessionUserGithubId: joi.number().required(),
  // not required
  tid: joi.string()
}).required().label('instance.stop job')

var queueName = 'instance.stop'

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
function InstanceStopWorker (job) {
  var logData = {
    tx: true,
    data: job,
    queue: queueName
  }
  log.info(logData, 'instance.stop - start')
  return workerUtils.validateJob(job, schema)
    .then(function () {
      return Instance.findOneStoppingAsync(job.instanceId, job.containerId)
    })
    .tap(workerUtils.assertFound(job, 'Instance'))
    .tap(function (instance) {
      log.info(logData, 'instance.stop - emit frontend updates')
      return InstanceService.emitInstanceUpdate(instance, job.sessionUserGithubId, 'stopping', true)
    })
    .then(function (instance) {
      log.info(logData, 'instance.stop - docker stop command')
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
