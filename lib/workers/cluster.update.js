/**
 * Handle `cluster.update` task
 * @module lib/workers/cluster.update
 */
'use strict'

require('loadenv')()
const BaseSchema = require('models/mongo/schemas/base')
const ClusterConfigService = require('models/services/cluster-config-service')
const Instance = require('models/mongo/instance')
const InstanceService = require('models/services/instance-service')
const joi = require('utils/joi')
const logger = require('logger')
const pluck = require('101/pluck')
const Promise = require('bluebird')
const UserService = require('models/services/user-service')
const DeploymentService = require('models/services/deployment-service')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

module.exports.jobSchema = joi.object({
  deploymentId: joi.string(),
  instanceId: joi.string().required(),
  pushInfo: joi.object({
    repo: joi.string().required(),
    branch: joi.string().required(),
    commit: joi.string().required(),
    user: joi.object({
      id: joi.number().required()
    }).unknown().required()
  }).unknown().required()
}).unknown().required()

/**
 * Update cluster
 * @param {Object} job - Job info
 * @returns {Promise}
 */
module.exports.task = (job) => {
  const log = logger.child({ method: 'Cluster Update Worker', job })
  return Promise.props({
    user: UserService.getCompleteUserByGithubId(job.pushInfo.user.id),
    instance: InstanceService.findInstanceById(job.instanceId),
    config: ClusterConfigService.fetchConfigByInstanceId(job.instanceId),
    deployment: DeploymentService.findActiveById('created', job.deploymentId)
  })
    .then(result => {
      const deployment = result.deployment
      const sessionUser = result.user
      const bigPoppaUser = sessionUser.bigPoppaUser
      const fullRepo = deployment.triggeredInfo.repo
      const filePaths = result.config.files.map(pluck('path'))
      const mainInstance = result.instance
      const clusterName = result.config.clusterName
      const commit = deployment.triggeredInfo.commit
      log.info({ result }, 'fetched data for cluster update')
      return ClusterConfigService.parseComposeFileAndPopulateENVs(fullRepo, clusterName, bigPoppaUser, filePaths[0], commit)
        .then(octobearInfo => {
          log.trace({ octobearInfo }, 'compose files parsed')
          const updatedClusterOpts = Object.assign({}, result.config, {
            files: octobearInfo.files
          })
          return ClusterConfigService.updateCluster(
            sessionUser,
            mainInstance,
            deployment.triggeredInfo,
            octobearInfo.results,
            updatedClusterOpts
          )
        })
    })
    .catch(Instance.NotFoundError, err => {
      throw new WorkerStopError('Instance not found', { err }, { level: 'info' })
    })
    .catch(BaseSchema.NotFoundError, err => {
      throw new WorkerStopError('Config not found', { err }, { level: 'info' })
    })
}
