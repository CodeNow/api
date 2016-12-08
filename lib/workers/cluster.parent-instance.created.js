/**
 * Handle `cluster.parent-instance.created` event
 * @module lib/workers/cluster.parent-instance.created
 */
'use strict'

require('loadenv')()

const Promise = require('bluebird')
const DockerComposeCluster = require('models/mongo/docker-compose-cluster')
const DockerComposeClusterService = require('models/services/docker-compose-cluster-service')
const logger = require('logger')
const rabbitMQ = require('models/rabbitmq')
const schemas = require('models/rabbitmq/schemas')
const UserService = require('models/services/user-service')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

module.exports.jobSchema = schemas.clusterParentInstanceCreated

/**
 * Cluster created parent-instance event
 * @param {Object} job - Job info
 * @returns {Promise}
 */
module.exports.task = (job) => {
  const log = logger.child({ method: 'ClusterCreatedWorker', job })
  const parsedInstances = job.parsedCompose.results
  const siblingsInstancesDefs = parsedInstances.find((inst) => {
    return !inst.metadata.isMain
  })
  return Promise.try(() => {
    if (!siblingsInstancesDefs) {
      throw new WorkerStopError('Job has no silings instances')
    }
  })
  .then(() => {
    log.info('fetch full user')
    return UserService.getCompleteUserByBigPoppaId(job.sessionUserBigPoppaId)
      .then((sessionUser) => {
        log.info({ sessionUser }, 'full user fetched')
        return Promise.map(siblingsInstancesDefs,
          (siblingInstanceDef) => {
            const bigPoppaOwnerObject = UserService.getBpOrgInfoFromRepoName(sessionUser, job.repoFullName)
            const orgInfo = {
              githubOrgId: bigPoppaOwnerObject.githubId,
              bigPoppaOrgId: bigPoppaOwnerObject.id
            }
            return DockerComposeClusterService.createClusterSibling(sessionUser, siblingInstanceDef, orgInfo, job.triggeredAction)
          })
      })
      .each((sibling) => {
        return DockerComposeCluster.findOneAndUpdateAsync({
          _id: job.cluster.id
        }, {
          $push: {
            siblingsInstanceIds: sibling._id
          }
        }).return(sibling)
      })
      .each((sibling) => {
        const newJob = Object.assign({}, job)
        newJob.instance = {
          id: sibling._id.toString()
        }
        log.info({ newJob }, 'publish new event that sibling instance was created')
        rabbitMQ.clusterSiblingInstanceCreated(newJob)
      })
  })
}
