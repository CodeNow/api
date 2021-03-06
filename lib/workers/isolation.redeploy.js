
/**
 * Redeploy isolation.
 * @module lib/workers/isolation.redeploy
 */
'use strict'

require('loadenv')()

const Isolation = require('models/mongo/isolation')
const Instance = require('models/mongo/instance')
const rabbitMQ = require('models/rabbitmq')
const joi = require('utils/joi')
const logger = require('logger')
const workerUtils = require('utils/worker-utils')

module.exports.jobSchema = joi.object({
  isolationId: joi.string().required()
}).unknown().required()

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
module.exports.task = function IsolationRedeployWorker (job) {
  const log = logger.child({
    method: 'IsolationRedeployWorker'
  })
  return Isolation.findOneAndUpdateAsync({
    _id: job.isolationId,
    state: 'killed',
    redeployOnKilled: true
  }, {
    $set: {
      state: 'redeploying'
    }
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
        instanceId: instance._id.toString(),
        sessionUserGithubId: instance.createdBy.github
      })
    })
  })
  .return(undefined)
}
