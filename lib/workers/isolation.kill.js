/**
 * Stop isolation.
 * @module lib/workers/isolation.kill
 */
'use strict'

require('loadenv')()
const objectId = require('objectid')

const Promise = require('bluebird')
const Isolation = require('models/mongo/isolation')
const IsolationService = require('models/services/isolation-service')
const Instance = require('models/mongo/instance')
const InstanceService = require('models/services/instance-service')
const joi = require('utils/joi')
const logger = require('logger')

module.exports.jobSchema = joi.object({
  isolationId: joi.string().required(),
  // defines if we will set state `killing` in the model that will cause redeploy
  triggerRedeploy: joi.boolean().required()
}).unknown().required()

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
module.exports.task = function IsolationKillWorker (job) {
  const log = logger.child({ method: 'IsolationKillWorker' })
  return Promise
    .try(function () {
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
    })
    .then(function (updated) {
      log.trace({ updated }, 'set stopping state on isolation if triggerRedeploy set')
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
      const killedPromises = instances.map(InstanceService.killInstance)
      return Promise.all(killedPromises)
    })
    .then(function () {
      log.trace('redeployIfAllKilled')
      return IsolationService.redeployIfAllKilled(objectId(job.isolationId))
    })
    .return(undefined)
}
