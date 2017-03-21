/**
 * Handle `cluster.create` task
 * @module lib/workers/cluster.create
 */
'use strict'

require('loadenv')()
const ClusterConfigService = require('models/services/cluster-config-service')
const logger = require('logger')
const joi = require('utils/joi')
const messenger = require('socket/messenger')
const pick = require('101/pick')
const UserService = require('models/services/user-service')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

module.exports.jobSchema = joi.object({
  sessionUserBigPoppaId: joi.number().required(),
  triggeredAction: joi.string().required().valid('user', 'webhook'),
  repoFullName: joi.string().required(),
  branchName: joi.string().required(),
  filePath: joi.string().required(),
  githubId: joi.number(),
  isTesting: joi.boolean().required(),
  clusterName: joi.string().required(),
  parentInputClusterConfigId: joi.string(),
  testReporters: joi.array().optional()
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
      const props = [ 'triggeredAction', 'repoFullName', 'branchName', 'filePath', 'isTesting', 'clusterName', 'testReporters' ]
      const opts = pick(job, props)
      return ClusterConfigService.create(sessionUser, opts)
        .then((inputClusterConfig) => {
          messenger.messageRoom('org', job.githubId, { task: 'compose-cluster-created', user: job.sessionUserBigPoppaId, inputClusterConfigId: inputClusterConfig._id})
        })
        .catch(err => {
          log.error({ err }, 'Creating the cluster failed')
          messenger.messageRoom('org', job.githubId, { task: 'compose-cluster-created', err: err.message, user: job.sessionUserBigPoppaId })
          throw new WorkerStopError('Something failed trying to create the config', { err })
        })
    })
}
