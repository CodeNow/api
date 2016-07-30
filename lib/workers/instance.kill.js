/**
 * Kill instance.
 * @module lib/workers/instance.kill
 */
'use strict'

require('loadenv')()

var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var joi = require('utils/joi')
var log = require('middlewares/logger')(__filename).log
var workerUtils = require('utils/worker-utils')

var Docker = require('models/apis/docker')
var TaskFatalError = require('ponos').TaskFatalError

module.exports = KillInstanceWorker

var schema = joi.object({
  instanceId: joi.string().required(),
  containerId: joi.string().required(),
  tid: joi.string()
}).required().label('instance.kill job')

var queueName = 'instance.kill'

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
function KillInstanceWorker (job) {
  log = log.child({
    tx: true,
    data: job
  })
  log.info('called')
  return workerUtils.validateJob(queueName, job, schema)
    .then(function () {
      return Instance.findOneStoppingAsync(job.instanceId, job.containerId)
    })
    .tap(workerUtils.assertFound(queueName, job, 'Instance'))
    .tap(function (instance) {
      log.info('emit frontend updates')
      return InstanceService.emitInstanceUpdate(instance, null, 'stopping', true)
    })
    .then(function () {
      log.info('docker kill command')
      var docker = new Docker()
      return docker.killContainerAsync(job.containerId)
        .catch(function (err) {
          if (err.isBoom && err.output.statusCode === 500 && /is not running/i.test(err.message)) {
            throw new TaskFatalError(
              'instance.kill',
              'Container is not running',
              { report: false, job: job }
            )
          }
          throw err
        })
    })
}
