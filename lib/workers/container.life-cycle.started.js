/**
 * Manage starting a build container (and save it to the context version)
 *
 * @module lib/workers/container.life-cycle.started
 */
'use strict'
require('loadenv')()

var rabbitMQ = require('models/rabbitmq')
var joi = require('utils/joi')
var log = require('middlewares/logger')(__filename).log
var TaskFatalError = require('ponos').TaskFatalError

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

  var schema = joi.object({
    inspectData: joi.object({
      Config: joi.object({
        Labels: joi.object({
          'contextVersion.id': joi.string().required(),
          'type': joi.string().required()
        }).unknown().required()
      }).unknown().required()
    }).unknown().required()
  }).unknown().required()

  return joi
    .validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(err)
    })
    .then(function createNextJob () {
      log.info(logData, 'ContainerLifeCycleStarted: createNextJob')

      if (job.inspectData.Config.Labels.type === 'image-builder-container') {
        return rabbitMQ.publishContainerImageBuilderStarted(job)
      }
    })
}
