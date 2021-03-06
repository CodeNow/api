/**
 * Publish context-version.deleted event when CV turns unused
 * @module lib/workers/context-version.delete
 */
'use strict'

const ContextVersion = require('models/mongo/context-version')
const Instance = require('models/mongo/instance')
const joi = require('utils/joi')
const logger = require('logger')
const rabbitMQ = require('models/rabbitmq')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

module.exports.jobSchema = joi.object({
  contextVersionId: joi.string().required()
}).unknown().required()

/**
 * Handle context-version.delete command
 * @param {Object} job - Job info
 * @returns {Promise}
 */
module.exports.task = function ContextVersionDelete (job) {
  const log = logger.child({ method: 'ContextVersionDelete' })
  return ContextVersion.findByIdAsync(job.contextVersionId)
    .tap(function (contextVersion) {
      if (!contextVersion) {
        throw new WorkerStopError('ContextVersion was not found')
      }
    })
    .tap(function (contextVersion) {
      log.trace({ contextVersion }, 'check usage')
      return Instance.findByContextVersionIdsAsync([ job.contextVersionId ])
        .then(function (instances) {
          log.trace(
            { contextVersion,
              instancesCount: instances.length },
            'checking instances'
          )
          if (instances.length > 0) {
            throw new WorkerStopError('ContextVersion is being used by multiple instances')
          }
        })
    })
    .tap(function (contextVersion) {
      log.trace({ contextVersion: contextVersion }, 'RabbitMQ contextVersionDeleted')
      // Only enqueue job if the context version is not used
      rabbitMQ.contextVersionDeleted({
        contextVersion: contextVersion.toJSON()
      })
    })
}
