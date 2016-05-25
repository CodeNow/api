/**
 * Delete context-version when it turns unused
 * @module lib/workers/context-version.delete
 */
'use strict'

// var ContextVersion = require('models/mongo/context-version')
// var Instance = require('models/mongo/instance')
var joi = require('utils/joi')
var logger = require('middlewares/logger')(__filename)
// var rabbitMQ = require('models/rabbitmq')
var TaskFatalError = require('ponos').TaskFatalError

module.exports = MatchCommitWithIsolationGroupMaster
var queueName = 'isolation.match-commit-with-master'

/**
 * Handle context-version.delete command
 * @param {Object} job - Job info
 * @returns {Promise}
 */
function MatchCommitWithIsolationGroupMaster (job) {
  var log = logger.log.child({
    tx: true,
    data: job
  })
  log.info('MatchCommitWithIsolationGroupMaster')

  var schema = joi.object({
    isolationId: joi.string().required()
  }).required().label('job')

  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(
        queueName,
        'Invalid Job',
        { validationError: err }
      )
    })
    .then(function () {
      throw new TaskFatalError(
        queueName,
        'Valid Job'
      )
    })
}

