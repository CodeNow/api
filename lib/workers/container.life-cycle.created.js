/**
 * Used as a router for all container start events
 * This worker will publish a job based on the type of container that created
 * @module lib/workers/container.life-cycle.created
 */
'use strict'
require('loadenv')()
var joi = require('joi')
var Promise = require('bluebird')

var logger = require('logger')
var rabbitMQ = require('models/rabbitmq')
var workerUtils = require('utils/worker-utils')

module.exports.jobSchema = joi.object({
  inspectData: joi.object({
    Config: joi.object({
      Labels: joi.object({
        type: joi.string()
      }).unknown().required()
    }).unknown().required()
  }).unknown().required()
}).unknown().required().label('container.life-cycle.created job')
/**
 * creates specific jobs based on the type
 * @return {Promise} worker task promise
 */
module.exports.task = function ContainerLifeCycleCreated (job) {
  var log = logger.child({ method: 'ContainerLifeCycleCreated' })
  log.info('ContainerLifeCycleCreated called')
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
