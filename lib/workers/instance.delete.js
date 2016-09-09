/**
 * Delete instance.
 * @module lib/workers/instance.delete
 */
'use strict'

require('loadenv')()

var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var IsolationService = require('models/services/isolation-service')
var joi = require('utils/joi')
var logger = require('logger')
var workerUtils = require('utils/worker-utils')

var messenger = require('socket/messenger')

module.exports.jobSchema = joi.object({
  instanceId: joi.string().required(),
  tid: joi.string()
}).required().label('instance.delete job')

/**
 * Handle instance.delete command
 * Flow is following:
 * 1. find instance
 * 2. mark instance as deleted
 * 3. remove instance from Graph db
 * 4. emit delete-instance-container command
 * 5. emit instance.delete command for each forked instances if this one is master
 * 6. remove instance from mongo
 * 7. send event to the frontend
 * @param {Object} job - Job info
 * @returns {Promise}
 * @resolve {undefined} this promise will not return anything
 */
module.exports.task = function InstanceDeleteWorker (job) {
  var log = logger.child({ method: 'InstanceDeleteWorker' })
  log.info('InstanceDeleteWorker called')
  return Instance.findByIdAsync(job.instanceId)
    .tap(workerUtils.assertFound(job, 'Instance'))
    .tap(function (instance) {
      log.trace('remove from graph')
      return instance.removeSelfFromGraph()
    })
    .tap(function (instance) {
      if (instance.isolated && instance.isIsolationGroupMaster) {
        return IsolationService.deleteIsolation(instance.isolated)
      }
    })
    .tap(function (instance) {
      log.trace('remove mongo model')
      return instance.removeAsync()
    })
    .tap(function (instance) {
      log.trace('delete-instance-container command')
      var container = instance.container
      if (container && container.dockerContainer) {
        InstanceService.deleteInstanceContainer(instance, container)
      }
    })
    .tap(function (instance) {
      log.trace('trigger commands to delete forks')
      return InstanceService.deleteAllInstanceForks(instance)
    })
    .then(function (instance) {
      log.trace('emit frontend updates')
      messenger.emitInstanceDelete(instance)
      return
    })
}
