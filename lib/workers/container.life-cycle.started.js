/**
 * Used as a router for all container start events
 * This worker will publish a job based on the type of container that started
 * @module lib/workers/container.life-cycle.started
 */
'use strict'
require('loadenv')()
var keypather = require('keypather')()
var Promise = require('bluebird')

var logger = require('logger')
var rabbitMQ = require('models/rabbitmq')

module.exports = ContainerLifeCycleStarted

/**
 * creates specific jobs based on the type of container that has started
 * @return {Promise} worker task promise
 */
function ContainerLifeCycleStarted (job) {
  var log = logger.child({ method: 'ContainerLifeCycleStarted' })
  log.info('ContainerLifeCycleStarted called')
  return Promise
    .try(function createNextJob () {
      log.trace('createNextJob')

      if (keypather.get(job, 'inspectData.Config.Labels.type') === 'image-builder-container') {
        return rabbitMQ.publishContainerImageBuilderStarted(job)
      }

      log.trace('ignoring this job')
    })
}
