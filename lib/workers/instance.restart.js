/**
 * Restart instance.
 * @module lib/workers/instance.restart
 */
'use strict'
require('loadenv')()

const Instance = require('models/mongo/instance')
const InstanceService = require('models/services/instance-service')
const joi = require('utils/joi')
const logger = require('logger')
const workerUtils = require('utils/worker-utils')
const Docker = require('models/apis/docker')

module.exports.jobSchema = joi.object({
  instanceId: joi.string().required(),
  containerId: joi.string().required(),
  sessionUserGithubId: joi.number().required()
}).unknown().required()

/**
 * Handle instance.restart command
 * Flow is following:
 * 1. find starting instance if still exists
 * 2. find context version
 * 3. send `restart` event to the frontend
 * 4. call docker restart
 * @param {Object} job - Job info
 * @returns {Promise}
 * @resolve {undefined} this promise will not return anything
 */
module.exports.task = function InstanceRestartWorker (job) {
  const log = logger.child({ method: 'InstanceStartWorker' })
  return Instance.findOneStarting(job.instanceId, job.containerId)
    .tap(workerUtils.assertFound(job, 'Instance'))
    .tap(function (instance) {
      log.trace('docker restart command')
      var docker = new Docker()
      return docker.restartContainerAsync(job.containerId)
    })
    .then(function (instance) {
      log.trace('emit frontend updates')
      return InstanceService.emitInstanceUpdate(instance, job.sessionUserGithubId, 'restart')
    })
}
