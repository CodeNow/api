/**
 * Stop isolation.
 * @module lib/workers/isolation.kill
 */
'use strict'

require('loadenv')()
var keypather = require('keypather')()
var objectId = require('objectid')

var Promise = require('bluebird')
var Isolation = require('models/mongo/isolation')
var IsolationService = require('models/services/isolation-service')
var InstanceService = require('models/services/instance-service')
var joi = require('utils/joi')
var TaskFatalError = require('ponos').TaskFatalError
var log = require('middlewares/logger')(__filename).log

module.exports = IsolationKillWorker

/**
 * Handle isolation.kill command
 * Flow is following:
 * 1. find isolation to kill
 * 2. set state to killing
 * 3. send `kill` command to every container in isolation
 * @param {Object} job - Job info
 * @returns {Promise}
 * @resolve {undefined} this promise will not return anything
 */
function IsolationKillWorker (job) {
  log = log.child({
    tx: true,
    data: job
  })
  var schema = joi.object({
    isolationId: joi.string().required(),
    tid: joi.string()
  }).required().label('job')
  log.info('called')
  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(
        'isolation.kill',
        'Invalid Job',
        { validationError: err }
      )
    })
    .then(function () {
      log.trace('set stopping state on isolation')
      return Isolation.findOneAndUpdateAsync({
        _id: objectId(job.isolationId)
      }, {
        $set: {
          state: 'killing'
        }
      })
    })
    .then(function (updated) {
      log.trace({updated: updated}, 'set stopping state on isolation')
      log.trace('find all instances for isolation')
      return IsolationService.findInstancesNotStoppingWithContainers(job.isolationId)
    })
    .filter(function (instance) {
      // We don't want to stop instances that are starting as we could have race conditions
      return !keypather.get(instance, 'container.inspect.State.Starting')
    })
    .then(function (instances) {
      log.trace({instancesLength: instances.length}, 'Triggering instance kills')
      var killedPromises = instances.map(function (instance) {
        return InstanceService.killInstance(instance)
      })
      return Promise.all(killedPromises)
    })
    .then(function () {
      return IsolationService.redeployIfAllKilled(objectId(job.isolationId))
    })
    .return(undefined)
}
