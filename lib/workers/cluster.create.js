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
const DeploymentService = require('models/services/deployment-service')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

module.exports.jobSchema = joi.object({
  deploymentId: joi.string(),
  filePath: joi.string().required(),
  githubId: joi.number(),
  isTesting: joi.boolean().required(),
  clusterName: joi.string().required(),
  parentInputClusterConfigId: joi.string().allow(''),
  testReporters: joi.array()
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
  return DeploymentService.findActiveById('created', job.deploymentId)
    .then(deployment => {
      const props = [ 'filePath', 'isTesting', 'clusterName', 'testReporters', 'parentInputClusterConfigId' ]
      const opts = pick(job, props)
      if (opts.parentInputClusterConfigId === '') {
        delete opts.parentInputClusterConfigId
      }
      opts.triggeredAction = deployment.triggeredAction
      opts.repoFullName = deployment.triggeredInfo.repo
      opts.branchName = deployment.triggeredInfo.branch
      return UserService.getCompleteUserByBigPoppaId(deployment.createdByUser)
        .then((sessionUser) => {
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
              throw new WorkerStopError('Something failed trying to create the config', { err })
            })
        })
    })
}
