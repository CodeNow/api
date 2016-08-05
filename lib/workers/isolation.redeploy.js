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
var log = require('middlewares/logger')(__filename).log
var workerUtils = require('utils/worker-utils')

module.exports = IsolationRedeployWorker

var queueName = 'isolation.redeploy'

var schema = joi.object({
  isolationId: joi.string().required(),
  // not required
  tid: joi.string()
}).required().label('isolation.redeploy job')

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
    data: job,
    queue: queueName
  })
  log.info('called')
  return workerUtils.validateJob(job, schema)
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
    .tap(workerUtils.assertFound(job, 'Isolation'))
    .then(function () {
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
