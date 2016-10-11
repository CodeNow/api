/**
 * Used as a router for all container died events
 * This worker will publish a job based on the type of container that died
 * @module lib/workers/container.life-cycle.died
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
}).unknown().label('container.image-builder.died job')
/**
 * creates specific jobs based on the type
 * @return {Promise} worker task promise
 */
module.exports.task = function ContainerLifeCycleDied (job) {
  const log = logger.child({ method: 'ContainerLifeCycleDied' })
  return Promise.try(function createNextJob () {
    if (workerUtils.isUserContainer(job)) {
      return rabbitMQ.publishInstanceContainerDied(job)
    }

    if (workerUtils.isImageBuilderContainer(job)) {
      return rabbitMQ.publishContainerImageBuilderDied(job)
    }

    log.trace('ignoring this job')
  })
}
