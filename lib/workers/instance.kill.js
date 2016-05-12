/**
 * Kill instance.
 * @module lib/workers/instance.kill
 */
'use strict'

require('loadenv')()

var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var joi = require('utils/joi')
var TaskFatalError = require('ponos').TaskFatalError
var log = require('middlewares/logger')(__filename).log

var Docker = require('models/apis/docker')

module.exports = KillInstanceWorker

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
  var schema = joi.object({
    instanceId: joi.string().required(),
    containerId: joi.string().required(),
    // not required
    tid: joi.string()
  }).required().label('job')
  log.info('called')
  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(
        'instance.stop',
        'Invalid Job',
        { validationError: err }
      )
    })
    .then(function () {
      log.info('find stopping instance')
      return Instance.findOneStoppingAsync(job.instanceId, job.containerId)
    })
    .then(function (instance) {
      log.info('validate instance')
      if (!instance) {
        throw new TaskFatalError(
          'instance.stop',
          'Instance not found',
          { report: false, job: job }
        )
      }
      return instance
    })
    .then(function (instance) {
      log.info('emit frontend updates')
      return InstanceService.emitInstanceUpdate(instance, null, 'stopping', true)
        .return(instance)
    })
    .then(function () {
      log.info('docker stop command')
      var docker = new Docker()
      return docker.killContainerAsync(job.containerId, true)
    })
}
