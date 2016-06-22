/**
 * Delete context-version when it turns unused
 * @module lib/workers/context-version.delete
 */
'use strict'

var ContextVersion = require('models/mongo/context-version')
var Instance = require('models/mongo/instance')
var joi = require('utils/joi')
var logger = require('middlewares/logger')(__filename)
var rabbitMQ = require('models/rabbitmq')
var TaskFatalError = require('ponos').TaskFatalError

module.exports = ContextVersionDelete

var schema = joi.object({
  contextVersionId: joi.string().required()
}).required().label('job')


/**
 * Handle context-version.delete command
 * @param {Object} job - Job info
 * @returns {Promise}
 */
function ContextVersionDelete (job) {
  var log = logger.log.child({
    tx: true,
    data: job
  })
  log.info('ContextVersionDelete')

  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(
        'contest-version.delete',
        'Invalid Job',
        { validationError: err }
      )
    })
    .then(function () {
      log.trace('ContextVersionDelete findById')
      return ContextVersion.findByIdAsync(job.contextVersionId)
    })
    .then(function (contextVersion) {
      if (!contextVersion) {
        throw new TaskFatalError(
          'contest-version.delete',
          'ContextVersion was not found and cannot be deleted'
        )
      }
      log.trace(
        { contextVersion: contextVersion },
        'ContextVersionDelete removeById'
      )
      return Instance.findByContextVersionIdsAsync([ job.contextVersionId ])
        .then(function (instances) {
          log.trace(
            { contextVersion: contextVersion },
            'ContextVersionDelete checking instances'
          )
          if (instances.length > 0) {
            throw new TaskFatalError(
              'contest-version.delete',
              'ContextVersion is being used by multiple instances'
            )
          }
          log.trace('ContextVersionDelete No instances using context version found')
          return ContextVersion.removeByIdAsync(job.contextVersionId)
        })
        .return(contextVersion)
    })
    .then(function (contextVersion) {
      log.trace(
        { contextVersion: contextVersion },
        'ContextVersionDelete RabbitMQ contextVersionDeleted'
      )
      // Only enqueue job if the context version got removed
      rabbitMQ.contextVersionDeleted({
        contextVersion: contextVersion
      })
    })
}
