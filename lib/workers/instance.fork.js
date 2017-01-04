/**
* Fork instance.
* @module lib/workers/instance.fork
*/
'use strict'
require('loadenv')()

const Instance = require('models/mongo/instance')
const InstanceForkService = require('models/services/instance-fork-service')
const InstanceService = require('models/services/instance-service')
const IsolationService = require('models/services/isolation-service')
const joi = require('utils/joi')
const logger = require('logger')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

module.exports.jobSchema = joi.object({
  instance: joi.object({
    shortHash: joi.string().required()
  }).unknown().required(),
  pushInfo: joi.object({
    repo: joi.string().required(),
    branch: joi.string().required(),
    commit: joi.string().required(),
    user: joi.object({
      id: joi.number().required()
    }).required()
  }).unknown().required()
}).unknown().required()

module.exports.msTimeout = 10000

module.exports.maxNumRetries = 5

/**
 * Handle instance.fork command
 * Flow is following:
 * 1. find stopping instance if still exists
 * 2. send `stopping` event to the frontend
 * 3. call docker kill
 * @param {Object} job - Job info
 * @returns {Promise}
 * @resolve {undefined} this promise will not return anything
 */
module.exports.task = (job) => {
  const log = logger.child({ method: 'Instance Fork' })
  return InstanceService.findInstance(job.instance.shortHash)
    .catch(Instance.NotFoundError, function (err) {
      throw new WorkerStopError('Instance not found', {
        err,
        job
      })
    })
    .then(function (instance) {
      return InstanceForkService.autoFork(instance, job.pushInfo)
    })
    .tap(function (newInstance) {
      return IsolationService.autoIsolate(newInstance, job.pushInfo)
    })
    .then(function (newInstance) {
      if (newInstance) {
        log.info('Successfully forked instance', {
          originalInstance: job.instance.shortHash,
          instance: newInstance
        })
      }
    })
}
