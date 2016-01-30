/**
 * Used as a router for all container start events
 * This worker will publish a job based on the type of container that started
 * @module lib/workers/container.life-cycle.started
 */
'use strict'
require('loadenv')()

var keypather = require('keypather')()
var Promise = require('bluebird')

var rabbitMQ = require('models/rabbitmq')
var log = require('middlewares/logger')(__filename).log

module.exports = ContainerLifeCycleStarted

/**
 * creates specific jobs based on the type of container that has started
 * @return {Promise} worker task promise
 */
function ContainerLifeCycleStarted (job) {
  var logData = {
    tx: true,
    job: job
  }

  return Promise.resolve()
    .then(function createNextJob () {
      log.info(logData, 'ContainerLifeCycleStarted: createNextJob')

      if (keypather.get(job, 'inspectData.Config.Labels.type') === 'image-builder-container') {
        return rabbitMQ.publishContainerImageBuilderStarted(job)
      }

      log.trace(logData, 'ContainerLifeCycleStarted: ignoring this job')
    })
}
