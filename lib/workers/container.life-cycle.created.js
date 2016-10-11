/**
 * Used as a router for all container start events
 * This worker will publish a job based on the type of container that created
 * @module lib/workers/container.life-cycle.created
 */
'use strict'
require('loadenv')()
const joi = require('joi')
const Promise = require('bluebird')

const logger = require('logger')
const rabbitMQ = require('models/rabbitmq')
const workerUtils = require('utils/worker-utils')

module.exports.jobSchema = joi.object({
  inspectData: joi.object({
    Config: joi.object({
      Labels: joi.object({
        type: joi.string()
      }).unknown()
    }).unknown()
  }).unknown()
}).unknown()
/**
 * creates specific jobs based on the type
 * @return {Promise} worker task promise
 */
module.exports.task = function ContainerLifeCycleCreated (job) {
  const log = logger.child({ method: 'ContainerLifeCycleCreated' })
  return Promise.try(function createNextJob () {
    if (workerUtils.isUserContainer(job)) {
      return rabbitMQ.publishInstanceContainerCreated(job)
    }

    if (workerUtils.isImageBuilderContainer(job)) {
      return rabbitMQ.publishContainerImageBuilderCreated(job)
    }

    log.trace('ignoring this job')
  })
}
