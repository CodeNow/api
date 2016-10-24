/**
 * Used as a router for all container start events
 * This worker will publish a job based on the type of container that started
 * @module lib/workers/container.life-cycle.started
 */
'use strict'
require('loadenv')()
const Promise = require('bluebird')

const workerUtils = require('utils/worker-utils')
const logger = require('logger')
const rabbitMQ = require('models/rabbitmq')
const schemas = require('models/schemas')
const workerUtils = require('utils/worker-utils')

module.exports.jobSchema = schemas.containerLifeCycleEvent

/**
 * creates specific jobs based on the type of container that has started
 * @return {Promise} worker task promise
 */
module.exports.task = function ContainerLifeCycleStarted (job) {
  const log = logger.child({ method: 'ContainerLifeCycleStarted' })
  return Promise.try(function createNextJob () {
    if (workerUtils.isUserContainer(job)) {
      return rabbitMQ.publishInstanceContainerCreated(job)
    }
    if (workerUtils.isImageBuilderContainer(job)) {
      return rabbitMQ.publishContainerImageBuilderStarted(job)
    }
    log.trace('ignoring this job')
  })
}
