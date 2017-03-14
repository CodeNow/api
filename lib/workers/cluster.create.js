/**
 * Handle `cluster.create` task
 * @module lib/workers/cluster.create
 */
'use strict'

require('loadenv')()
const ClusterConfigService = require('models/services/cluster-config-service')
const logger = require('logger')
const joi = require('utils/joi')
const pick = require('101/pick')
const UserService = require('models/services/user-service')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

module.exports.jobSchema = joi.object({
  sessionUserBigPoppaId: joi.number().required(),
  triggeredAction: joi.string().required().valid('user', 'webhook'),
  repoFullName: joi.string().required(),
  branchName: joi.string().required(),
  filePath: joi.string().required(),
  isTesting: joi.boolean().optional(),
  testReporter: joi.string().allow('').optional(),
  newInstanceName: joi.string().required()
}).unknown().required()

/**
 * Create cluster
 * @param {Object} job - Job info
 * @returns {Promise}
 */
module.exports.task = (job) => {
  const log = logger.child({
    method: 'ClusterCreateWorker',
    job
  })
  return UserService.getCompleteUserByBigPoppaId(job.sessionUserBigPoppaId)
    .then(sessionUser => {
      const props = [ 'triggeredAction', 'repoFullName', 'branchName', 'filePath', 'isTesting', 'newInstanceName', 'testReporter' ]
      const opts = pick(job, props)
      return ClusterConfigService.create(sessionUser, opts)
        .catch(err => {
          log.error({ err }, 'Creating the cluster failed')
          throw new WorkerStopError('Something failed trying to create the config', { err })
        })
    })
}
