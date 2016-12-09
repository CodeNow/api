/**
 * Handle `cluster.sibling-instance.create` task
 * @module lib/workers/cluster.sibling-instance.create
 */
'use strict'

require('loadenv')()

const DockerComposeCluster = require('models/mongo/docker-compose-cluster')
const DockerComposeClusterService = require('models/services/docker-compose-cluster-service')
const logger = require('logger')
const rabbitMQ = require('models/rabbitmq')
const schemas = require('models/rabbitmq/schemas')
const UserService = require('models/services/user-service')

module.exports.jobSchema = schemas.clusterSiblingInstanceCreate

/**
 * Cluster create sibling-instance task
 * @param {Object} job - Job info
 * @returns {Promise}
 */
module.exports.task = (job) => {
  const log = logger.child({ method: 'ClusterSiblingInstanceCreate', job })
  const siblingInstanceDef = job.parsedComposeSiblingData
  return UserService.getCompleteUserByBigPoppaId(job.sessionUserBigPoppaId)
    .then((sessionUser) => {
      log.info({ sessionUser }, 'full user fetched')
      const bigPoppaOwnerObject = UserService.getBpOrgInfoFromRepoName(sessionUser, job.repoFullName)
      const orgInfo = {
        githubOrgId: bigPoppaOwnerObject.githubId,
        bigPoppaOrgId: bigPoppaOwnerObject.id
      }
      return DockerComposeClusterService.createClusterSibling(sessionUser, siblingInstanceDef, orgInfo, job.triggeredAction)
    })
    .then((sibling) => {
      return DockerComposeCluster.findOneAndUpdateAsync({
        _id: job.cluster.id
      }, {
        $push: {
          siblingsInstanceIds: sibling._id
        }
      }).return(sibling)
    })
    .then((sibling) => {
      const newJob = Object.assign({
        instance: {
          id: sibling._id.toString()
        }
      }, job)
      log.info({ newJob }, 'publish new event that sibling instance was created')
      rabbitMQ.clusterSiblingInstanceCreated(newJob)
    })
}
