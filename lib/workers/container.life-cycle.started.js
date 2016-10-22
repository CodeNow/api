/**
 * Used as a router for all container start events
 * This worker will publish a job based on the type of container that started
 * @module lib/workers/container.life-cycle.started
 */
'use strict'
require('loadenv')()
const joi = require('joi')
const Promise = require('bluebird')

const workerUtils = require('utils/worker-utils')
const logger = require('logger')
const rabbitMQ = require('models/rabbitmq')

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
 * creates specific jobs based on the type of container that has started
 * @return {Promise} worker task promise
 */
module.exports.task = function ContainerLifeCycleStarted (job) {
  const log = logger.child({ method: 'ContainerLifeCycleStarted' })
  return Promise.try(function createNextJob () {
    if (workerUtils.isImageBuilderContainer(job)) {
      return rabbitMQ.publishContainerImageBuilderStarted(job)
    }

    log.trace('ignoring this job')
  })
}
