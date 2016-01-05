/**
 * Delete instance.
 * @module lib/workers/instance.delete
 */
'use strict'

require('loadenv')()

var Promise = require('bluebird')

var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var joi = require('utils/joi')
var TaskFatalError = require('ponos').TaskFatalError
var log = require('middlewares/logger')(__filename).log

var messenger = require('socket/messenger')
var rabbitMQ = require('models/rabbitmq')

module.exports = InstanceDeleteWorker

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
  var schema = joi.object({
    instanceId: joi.string().required(),
    // not required
    tid: joi.string()
  })
  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(err)
    })
    .then(function () {
      log.info(logData, 'instance.delete - find instance')
      return Instance.findByIdAsync(job.instanceId)
    })
    .then(function (instance) {
      log.info(logData, 'instance.delete - validate instance')
      if (!instance) {
        throw new TaskFatalError('Instance not found')
      }
      return instance
    })
    .then(function (instance) {
      log.info(logData, 'instance.delete - remove from graph')
      return instance.removeSelfFromGraphAsync().return(instance)
    })
    .then(function (instance) {
      log.info(logData, 'instance.delete - remove mongo model')
      return Promise.fromCallback(function (cb) {
        instance.remove(cb)
      }).return(instance)
    })
    .then(function (instance) {
      log.info(logData, 'instance.delete - delete-instance-container command')
      var container = instance.container
      if (container) {
        var branch = Instance.getMainBranchName(instance)
        var deleteContainerTask = {
          instanceShortHash: instance.shortHash,
          instanceName: instance.name,
          instanceMasterPod: instance.masterPod,
          instanceMasterBranch: branch,
          container: container,
          ownerGithubId: instance.owner.github,
          ownerGithubUsername: instance.owner.username
        }
        rabbitMQ.deleteInstanceContainer(deleteContainerTask)
      }
      return instance
    })
    .then(function (instance) {
      log.info(logData, 'instance.delete - trigger commands to delete forks')
      return InstanceService.deleteAllInstanceForks(instance).return(instance)
    })
    .then(function (instance) {
      log.info(logData, 'instance.delete - emit frontend updates')
      messenger.emitInstanceDelete(instance)
      return
    })
}
