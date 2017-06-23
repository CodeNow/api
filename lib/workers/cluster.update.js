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
const ClusterBuildService = require('models/services/cluster-build-service')
const UserService = require('models/services/user-service')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

module.exports.jobSchema = joi.object({
  clusterBuildId: joi.string(),
  instanceId: joi.string().required()
}).unknown().required()

/**
 * Update cluster
 * @param {Object} job - Job info
 * @returns {Promise}
 */
module.exports.task = (job) => {
  const log = logger.child({ method: 'Cluster Update Worker', job })
  return Promise.props({
    instance: InstanceService.findInstanceById(job.instanceId),
    clusterBuild: ClusterBuildService.findActiveById(job.clusterBuildId, 'created')
  })
    .then(result => {
      const clusterBuild = result.clusterBuild
      log.info({ result }, 'fetched data for cluster update')
      return UserService.getCompleteUserByGithubId(clusterBuild.createdByUser)
        .then((sessionUser) => {
          const mainInstance = result.instance

          return ClusterConfigService.fetchComposeInfoByInstanceId(
            sessionUser,
            job.instanceId,
            clusterBuild.triggeredInfo
          )
            .tap(results => log.info({ results }, 'Cluster info found'))
            .then(results => {
              return ClusterConfigService.updateCluster(
                sessionUser,
                mainInstance,
                clusterBuild.triggeredInfo,
                results.services,
                results.clusterOpts
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
