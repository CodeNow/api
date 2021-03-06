/**
 * Delete instance.
 * @module lib/workers/instance.delete
 */
'use strict'

require('loadenv')()

const Instance = require('models/mongo/instance')
const joi = require('utils/joi')
const keypather = require('keypather')()
const logger = require('logger')
const workerUtils = require('utils/worker-utils')
const rabbitMQ = require('models/rabbitmq')

const messenger = require('socket/messenger')

module.exports.jobSchema = joi.object({
  instanceId: joi.string().required()
}).unknown().required()

/**
 * Handle instance.delete command
 * Flow is following:
 * 1. find instance
 * 2. remove instance from Graph db
 * 3. remove instance from mongo
 * 4. emit instance.container.delete command
 * 5. send event to the frontend and emit `instance.deleted`
 * @param {Object} job - Job info
 * @returns {Promise}
 * @resolve {undefined} this promise will not return anything
 */
module.exports.task = (job) => {
  const log = logger.child({ method: 'InstanceDeleteWorker' })
  return Instance.findByIdAsync(job.instanceId)
    .tap(workerUtils.assertFound(job, 'Instance'))
    .tap(function (instance) {
      log.trace('remove from graph')
      return instance.removeSelfFromGraph()
    })

    .tap(function (instance) {
      log.trace('remove mongo model')
      return instance.removeAsync()
    })
    .tap(function (instance) {
      log.trace('delete-instance-container command')
      const containerId = keypather.get(instance, 'container.dockerContainer')
      if (containerId) {
        rabbitMQ.deleteContainer({ containerId })
      }
    })
    .then(function (instance) {
      log.trace('emit frontend updates')
      messenger.emitInstanceDelete(instance)
      return
    })
}
