/**
 * Redeploy isolation.
 * @module lib/workers/isolation.redeploy
 */
'use strict'

require('loadenv')()

var Isolation = require('models/mongo/isolation')
var Instance = require('models/mongo/instance')
var rabbitMQ = require('models/rabbitmq')
var joi = require('utils/joi')
var TaskFatalError = require('ponos').TaskFatalError
var log = require('middlewares/logger')(__filename).log

module.exports = IsolationRedeployWorker

/**
 * Handle isolation.redeploy command
 * Flow is following:
 * 1. find isolation to redeploy
 * 2. set state to `redeploying`
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
      return Isolation.findOneAndUpdateAsync({
        _id: job.isolationId,
        state: 'killed',
        redeployOnKilled: true
      }, {
        $set: {
          state: 'redeploying'
        }
      })
    })
    .then(function (found) {
      if (!found) {
        throw new TaskFatalError(
          'isolation.redeploy',
          'Isolation in state killed with redeployOnKilled not found'
        )
      }
      log.trace('find all instances for isolation')
      return Instance.findAsync({
        isolated: job.isolationId
      })
    })
    .then(function (instances) {
      instances.forEach(function (instance) {
        rabbitMQ.redeployInstanceContainer({
          instanceId: instance._id,
          sessionUserGithubId: instance.createdBy.github
        })
      })
    })
    .return(undefined)
}
