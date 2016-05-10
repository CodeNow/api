/**
 * Redeploy isolation.
 * @module lib/workers/isolation.redeploy
 */
'use strict'

require('loadenv')()

var Isolation = require('models/mongo/isolation')
var rabbitMQ = require('models/rabbitmq')
var joi = require('utils/joi')
var TaskFatalError = require('ponos').TaskFatalError
var log = require('middlewares/logger')(__filename).log

module.exports = IsolationRedeployWorker

/**
 * Handle isolation.redeploy command
 * Flow is following:
 * 1. find isolation to redeploy
 * 2. set stopping to false for isolation in redis
 * 3. send `redeploy` command to every container in isolation
 * @param {Object} job - Job info
 * @returns {Promise}
 * @resolve {undefined} this promise will not return anything
 */
function IsolationRedeployWorker (job) {
  log = log.child({
    tx: true,
    data: job
  })
  var schema = joi.object({
    isolationId: joi.string().required(),
    // not required
    tid: joi.string()
  }).required().label('job')
  log.info('called')
  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(
        'isolation.redeploy',
        'Invalid Job',
        { validationError: err }
      )
    })
    .then(function () {
      log.trace('set stopping state on isolation')
      return Isolation.findOneAndUpdate({
        _id: job.isolationId
      }, {
        $set: {
          stopping: false
        }
      })
    })
    .then(function () {
      log.trace('find all instances for isolation')
      return Instance.find({
        isolated: job.isolationId
      })
    })
    .each(function (instance) {
      rabbitMQ.redeployInstanceContainer({
        instanceId: instance._id,
        sessionUserGithubId: instance.owner.github
      })
    })
}
