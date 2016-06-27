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
var TaskFatalError = require('ponos').TaskFatalError
var log = require('middlewares/logger')(__filename).log

var messenger = require('socket/messenger')

module.exports = InstanceDeleteWorker

var schema = joi.object({
  instanceId: joi.string().required(),
  // not required
  tid: joi.string()
}).required().label('job')

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
function InstanceDeleteWorker (job) {
  var logData = {
    tx: true,
    data: job
  }
  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(
        'instance.delete',
        'Invalid Job',
        { validationError: err }
      )
    })
    .then(function () {
      log.info(logData, 'instance.delete - find instance')
      return Instance.findByIdAsync(job.instanceId)
    })
    .tap(function (instance) {
      log.info(logData, 'instance.delete - validate instance')
      if (!instance) {
        // NOTE Don't report this, as it doesn't matter in this case
        throw new TaskFatalError(
          'instance.delete',
          'Instance not found',
          { report: false, job: job }
        )
      }
    })
    .tap(function (instance) {
      log.info(logData, 'instance.delete - remove from graph')
      return instance.removeSelfFromGraphAsync()
    })
    .then(function (instance) {
      if (instance.isolated && instance.isIsolationGroupMaster) {
        return IsolationService.deleteIsolation(instance.isolated)
          .return(instance)
      } else {
        return instance
      }
    })
    .tap(function (instance) {
      log.info(logData, 'instance.delete - remove mongo model')
      return instance.removeAsync()
    })
    .tap(function (instance) {
      log.info(logData, 'instance.delete - delete-instance-container command')
      var container = instance.container
      if (container) {
        InstanceService.deleteInstanceContainer(instance, container)
      }
    })
    .tap(function (instance) {
      log.info(logData, 'instance.delete - trigger commands to delete forks')
      return InstanceService.deleteAllInstanceForks(instance)
    })
    .then(function (instance) {
      log.info(logData, 'instance.delete - emit frontend updates')
      messenger.emitInstanceDelete(instance)
      return
    })
}
