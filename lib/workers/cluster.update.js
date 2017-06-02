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
const octobear = require('@runnable/octobear')
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
      const filePaths = result.config.files.map(pluck('path'))
      const mainInstance = result.instance
      const clusterName = result.config.clusterName
      const commit = job.pushInfo.commit
      let composeFileData
      log.info({ result }, 'fetched data for cluster update')
      return ClusterConfigService.fetchFileFromGithub(bigPoppaUser, fullRepo, filePaths[0], commit)
        .then((mainComposeFileData) => {
          composeFileData = mainComposeFileData
          return octobear.findExtendedFiles(composeFileData.fileString)
        })
        .then((allFilesPathes) => {
          return ClusterConfigService.fetchFilesFromGithub(bigPoppaUser, fullRepo, allFilesPathes)
        })
        .tap(allComposeFiles => log.info({ allComposeFiles }, 'Compose files data'))
        .then((allComposeFiles) => {
          const newFiles = allComposeFiles.map((file) => {
            return {
              path: file.path,
              sha: file.sha
            }
          })
          const newFilesContents = allComposeFiles.map((file) => {
            return {
              dockerComposeFileString: file.fileString,
              dockerComposeFilePath: file.path
            }
          })
          const filesContents = newFilesContents.concat({
            dockerComposeFileString: composeFileData.fileString,
            dockerComposeFilePath: composeFileData.path
          })
          log.trace({ newFiles, newFilesContents }, 'updated files metadata')
          return ClusterConfigService.parseComposeFilesIntoServices(filesContents, fullRepo, clusterName,
            bigPoppaUser, commit, filePaths[0])
            .then(octobearInfo => {
              log.trace({ octobearInfo }, 'Compose file parsed')
              const updatedClusterOpts = Object.assign({}, result.config, {
                files: newFiles
              })
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
