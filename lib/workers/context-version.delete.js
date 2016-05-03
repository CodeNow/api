/**
 * Delete context-version when it turns unused
 * @module lib/workers/context-version.delete
 */
'use strict'

var ContextVersion = require('models/mongo/context-version')
var joi = require('utils/joi')
var logger = require('middlewares/logger')(__filename)
var rabbitMQ = require('models/rabbitmq')

module.exports = ContextVersionDelete

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

  var schema = joi.object({
    contextVersionId: joi.string().required()
  }).unknown().required().label('job')

  return joi.validateOrBoomAsync(job, schema)
    .then(function validateInstanceMasterBranch () {
      log.trace('ContextVersionDelete findById')
      return ContextVersion.findByIdAsync(job.contextVersionId)
    })
    .then(function (contextVersion) {
      log.trace(
        { contextVersion: contextVersion },
        'ContextVersionDelete removeById'
      )
      return ContextVersion.findByIdAsync(job.contextVersionId)
        .return(contextVersion)
    })
    .then(function (contextVersion) {
      log.trace(
        { contextVersion: contextVersion },
        'ContextVersionDelete RabbitMQ contextVersionDeleted'
      )
      rabbitMQ.contextVerisonDeleted({
        contextVersion: contextVersion
      })
    })
}

