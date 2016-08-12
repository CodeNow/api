/**
 * Restart instance.
 * @module lib/workers/instance.restart
 */
'use strict'

require('loadenv')()

var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var joi = require('utils/joi')
var logger = require('logger')
var workerUtils = require('utils/worker-utils')
var Docker = require('models/apis/docker')

module.exports = InstanceRestartWorker

var schema = joi.object({
  instanceId: joi.string().required(),
  containerId: joi.string().required(),
  sessionUserGithubId: joi.number().required(),
  tid: joi.string()
}).required().label('instance.restart job')

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
function InstanceRestartWorker (job) {
  var log = logger.child({ method: 'InstanceStartWorker' })
  log.info('InstanceStartWorker start')
  return workerUtils.validateJob(job, schema)
    .then(function () {
      return Instance.findOneStartingAsync(job.instanceId, job.containerId)
    })
    .tap(workerUtils.assertFound(job, 'Instance'))
    .tap(function (instance) {
      log.trace('docker restart command')
      var docker = new Docker()
      return docker.restartContainerAsync(job.containerId)
    })
    .then(function (instance) {
      log.trace('emit frontend updates')
      return InstanceService.emitInstanceUpdate(instance, job.sessionUserGithubId, 'restart', true)
    })
}
