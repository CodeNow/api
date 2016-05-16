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
      // Verify the isolation has the redeploy flag.
      return Isolation.findAsync({
        _id: job.isolationId
      })
        .then(function (isolation) {
          if (isolation.state !== 'killed') {
            throw new TaskFatalError(
              'isolation.redeploy',
              'Isolation state is not killed',
              { isolation: isolation }
            )
          }
          if (isolation.redeployOnKilled !== true) {
            throw new TaskFatalError(
              'isolation.redeploy',
              'Isolation is not set to redeploy on killed',
              { isolation: isolation }
            )
          }
        })
    })
    .then(function () {
      log.trace('set stopping state on isolation')
      return Isolation.findOneAndUpdateAsync({
        _id: job.isolationId
      }, {
        $set: {
          state: 'redeploying'
        }
      })
    })
    .then(function () {
      log.trace('find all instances for isolation')
      return Instance.findAsync({
        isolated: job.isolationId
      })
    })
    .each(function (instance) {
      rabbitMQ.redeployInstanceContainer({
        instanceId: instance._id,
        sessionUserGithubId: instance.owner.github
      })
    })
    .return(undefined)
}
