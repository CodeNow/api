/**
 * Stop isolation.
 * @module lib/workers/isolation.kill
 */
'use strict'

require('loadenv')()
var objectId = require('objectid')

var Promise = require('bluebird')
var Isolation = require('models/mongo/isolation')
var IsolationService = require('models/services/isolation-service')
var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var joi = require('utils/joi')
var TaskFatalError = require('ponos').TaskFatalError
var logger = require('logger')

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
  var log = logger.child({
    tx: true,
    data: job,
    method: 'IsolationKillWorker'
  })
  var schema = joi.object({
    isolationId: joi.string().required(),
    // defines if we will set state `killing` in the model that will cause redeploy
    triggerRedeploy: joi.boolean().required(),
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
      if (job.triggerRedeploy) {
        return Isolation.findOneAndUpdateAsync({
          _id: objectId(job.isolationId)
        }, {
          $set: {
            state: 'killing'
          }
        })
      }
      return
    })
    .then(function (updated) {
      log.trace({updated: updated}, 'set stopping state on isolation if triggerRedeploy set')
      log.trace('find instances to kill')
      return Instance.findAsync({
        isolated: job.isolationId,
        'container.inspect.State.Stopping': {
          $ne: true
        },
        'container.inspect.State.Running': true,
        'container.inspect.State.Starting': {
          $ne: true
        }
      })
    })
    .then(function (instances) {
      log.trace({instancesLength: instances.length}, 'triggering instance kills')
      var killedPromises = instances.map(InstanceService.killInstance)
      return Promise.all(killedPromises)
    })
    .then(function () {
      log.trace('redeployIfAllKilled')
      return IsolationService.redeployIfAllKilled(objectId(job.isolationId))
    })
    .return(undefined)
}
