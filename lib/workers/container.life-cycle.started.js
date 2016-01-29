/**
 * Manage starting a build container (and save it to the context version)
 *
 * @module lib/workers/container.life-cycle.started
 */
'use strict'
require('loadenv')()

var isString = require('101/is-string')
var joi = require('utils/joi')
var TaskFatalError = require('ponos').TaskFatalError

var log = require('middlewares/logger')(__filename).log
var rabbitMQ = require('models/rabbitmq')

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
          'contextVersion.build._id': joi.string().required(),
          'type': joi.string().required()
        }).unknown().required()
      }).unknown().required()
    }).unknown().required()
  }).unknown().required().label('Job')

  return joi
    .validateOrBoomAsync(job, schema)
    .catch(function (err) {
      var error = new TaskFatalError(
        'container.life-cycle.started',
        'validation failed',
        { job: job, err: err }
      )

      // do not report non-image-builder containers
      if (isString(job.from) &&
        !~job.from.indexOf('registry.runnable.com/runnable/image-builder')) {
        error.report = false
      }

      throw error
    })
    .then(function createNextJob () {
      log.info(logData, 'ContainerLifeCycleStarted: createNextJob')

      if (job.inspectData.Config.Labels.type === 'image-builder-container') {
        return rabbitMQ.publishContainerImageBuilderStarted(job)
      }
    })
}
