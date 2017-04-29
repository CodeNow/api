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
      const filePathes = result.config.files.map(pluck('path'))
      const mainInstance = result.instance
      const clusterName = result.config.clusterName
      const commit = job.pushInfo.commit
      log.info({ result }, 'fetched data for cluster update')
      return ClusterConfigService.fetchFilesFromGithub(bigPoppaUser, fullRepo, filePathes, commit)
        .tap(composeFilesData => log.info({ composeFilesData }, 'Compose files data'))
        .then(composeFilesData => {
          const newFiles = composeFilesData.map((file) => {
            return {
              path: file.path,
              sha: file.sha
            }
          })
          log.trace({ newFiles }, 'updated files metadata')
          return ClusterConfigService.parseComposeFileAndPopulateENVs(composeFilesData[0], fullRepo, clusterName, bigPoppaUser, filePathes[0])
            .then(octobearInfo => {
              log.trace({ octobearInfo }, 'Compose file parsed')
              const updatedClusterOpts = {
                clusterName,
                files: newFiles
              }
              return ClusterConfigService.updateCluster(
                sessionUser,
                mainInstance,
                githubPushInfo,
                octobearInfo.results,
                updatedClusterOpts
              )
            })
        })
    })
    .catch(Instance.NotFoundError, err => {
      throw new WorkerStopError('Instance not found', { err }, { level: 'info' })
    })
    .catch(BaseSchema.NotFoundError, err => {
      throw new WorkerStopError('Config not found', { err }, { level: 'info' })
    })
}
