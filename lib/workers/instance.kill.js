/**
* Kill instance.
* @module lib/workers/instance.kill
*/
'use strict'
require('loadenv')()

var Promise = require('bluebird')
var WorkerStopError = require('error-cat/errors/worker-stop-error')

var Docker = require('models/apis/docker')
var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var joi = require('utils/joi')
var logger = require('logger')
var rabbitMQ = require('models/rabbitmq')
var workerUtils = require('utils/worker-utils')

module.exports.jobSchema = joi.object({
  instanceId: joi.string().required(),
  containerId: joi.string().required(),
  tid: joi.string()
}).required().label('instance.kill job')

module.exports.msTimeout = 10000

module.exports.maxNumRetries = 5

/**
 * set error on instance object if possible
 * @param  {object}   validated job data
 * @return {Promise}
 */
module.exports.finalRetryFn = function (job) {
  return Promise.try(function emitContainerError () {
    rabbitMQ.instanceContainerErrored({
      instanceId: job.instanceId,
      containerId: job.containerId,
      error: 'failed to kill instance.'
    })
  })
}

/**
 * Handle instance.kill command
 * Flow is following:
 * 1. find stopping instance if still exists
 * 2. send `stopping` event to the frontend
 * 3. call docker kill
 * @param {Object} job - Job info
 * @returns {Promise}
 * @resolve {undefined} this promise will not return anything
 */
module.exports.task = function (job) {
  var log = logger.child({ method: 'InstanceKill' })
  log.info('called KillInstanceWorker')
  return Instance.findOneStoppingAsync(job.instanceId, job.containerId)
    .tap(workerUtils.assertFound(job, 'Instance'))
    .tap(function (instance) {
      log.trace('emit frontend updates')
      return InstanceService.emitInstanceUpdate(instance, null, 'stopping', true)
    })
    .then(function () {
      log.trace('docker kill command')
      var docker = new Docker()
      return docker.killContainerAsync(job.containerId)
        .catch(function (err) {
          if (err.isBoom && err.output.statusCode === 500 && /is not running/i.test(err.message)) {
            throw new WorkerStopError(
              'Container is not running',
              { job: job }, { level: 'info' }
            )
          }
          throw err
        })
    })
    .catch(WorkerStopError, function (err) {
      rabbitMQ.instanceContainerErrored({
        instanceId: job.instanceId,
        containerId: job.containerId,
        error: err.message
      })

      throw err
    })
}
