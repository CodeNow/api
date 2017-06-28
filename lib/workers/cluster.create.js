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
const rabbitMQ = require('models/rabbitmq')
const UserService = require('models/services/user-service')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

module.exports.jobSchema = joi.object({
  mainInstanceServiceName: joi.string().optional(), // Instance service name
  sessionUserBigPoppaId: joi.number().required(),
  triggeredAction: joi.string().required().valid('user', 'webhook'),
  repoFullName: joi.string().required(),
  branchName: joi.string().required(),
  filePath: joi.string().required(),
  githubId: joi.number(),
  isTesting: joi.boolean().required(),
  clusterName: joi.string().required(),
  clusterCreateId: joi.string(),
  parentInputClusterConfigId: joi.string().allow(''),
  testReporters: joi.array(),
  shouldNotAutoFork: joi.boolean().required()
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
      const props = [
        'triggeredAction',
        'repoFullName',
        'branchName',
        'filePath',
        'isTesting',
        'clusterName',
        'clusterCreateId',
        'testReporters',
        'parentInputClusterConfigId',
        'shouldNotAutoFork',
        'mainInstanceServiceName'
      ]
      const opts = pick(job, props)
      if (opts.parentInputClusterConfigId === '') {
        delete opts.parentInputClusterConfigId
      }
      return ClusterConfigService.create(sessionUser, opts)
        .then((inputClusterConfig) => {
          ClusterConfigService.sendClusterSocketUpdate(job.githubId,
            {
              task: 'compose-cluster-created',
              clusterName: job.clusterName,
              parentInputClusterConfigId: inputClusterConfig._id
            }
          )
        })
        .catch(err => {
          log.error({ err, stack: err.stack }, 'Creating the cluster failed')
          ClusterConfigService.sendClusterSocketUpdate(job.githubId,
            {
              task: 'compose-cluster-created',
              err: err.message,
              clusterName: job.clusterName
            }
          )
          let delay = 2000
          rabbitMQ.cleanupCluster({
            githubId: job.githubId,
            clusterCreateId: err.clusterCreateId,
            delay: delay
          })
          rabbitMQ.cleanupCluster({
            githubId: job.githubId,
            clusterCreateId: err.clusterCreateId,
            delay: delay *= 2
          })
          rabbitMQ.cleanupCluster({
            githubId: job.githubId,
            clusterCreateId: err.clusterCreateId,
            delay: delay *= 2
          })
          throw new WorkerStopError('Something failed trying to create the config', { err })
        })
    })
}
