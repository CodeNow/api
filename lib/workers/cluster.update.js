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
const Promise = require('bluebird')
const UserService = require('models/services/user-service')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

module.exports.jobSchema = joi.object({
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
  const githubPushInfo = job.pushInfo
  return Promise.props({
    user: UserService.getCompleteUserByGithubId(job.pushInfo.user.id),
    instance: InstanceService.findInstanceById(job.instanceId),
    config: ClusterConfigService.fetchConfigByInstanceId(job.instanceId)
  })
    .then(result => {
      const sessionUser = result.user
      const bigPoppaUser = sessionUser.bigPoppaUser
      const fullRepo = job.pushInfo.repo
      const filePath = result.config.filePath
      const mainInstance = result.instance
      const clusterName = result.config.clusterName
      log.info({ result }, 'fetched data for cluster update')
      return ClusterConfigService.fetchFileFromGithub(bigPoppaUser, fullRepo, filePath)
        .then(composeFileData => {
          log.info({ composeFileData }, 'Compose file data')
          return ClusterConfigService.parseComposeFileAndPopulateENVs(composeFileData, fullRepo, clusterName, bigPoppaUser)
        })
        .then(octobearInfo => {
          log.info({ octobearInfo }, 'Compose file parsed')
          return ClusterConfigService.updateCluster(
            sessionUser,
            mainInstance,
            githubPushInfo,
            octobearInfo.results
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
