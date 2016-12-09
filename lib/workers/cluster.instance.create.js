/**
 * Handle `cluster.instance.create` task
 * @module lib/workers/cluster.instance.create
 */
'use strict'

require('loadenv')()

const DockerComposeCluster = require('models/mongo/docker-compose-cluster')
const DockerComposeClusterService = require('models/services/docker-compose-cluster-service')
const logger = require('logger')
const rabbitMQ = require('models/rabbitmq')
const schemas = require('models/rabbitmq/schemas')
const UserService = require('models/services/user-service')

module.exports.jobSchema = schemas.clusterInstanceCreate

/**
 * Cluster create instance task
 * @param {Object} job - Job info
 * @returns {Promise}
 */
module.exports.task = (job) => {
  const log = logger.child({ method: 'ClusterInstanceCreate', job })
  const instanceDef = job.parsedComposeInstanceData
  return UserService.getCompleteUserByBigPoppaId(job.sessionUserBigPoppaId)
    .then((sessionUser) => {
      log.info({ sessionUser }, 'full user fetched')
      const bigPoppaOwnerObject = UserService.getBpOrgInfoFromRepoName(sessionUser, job.repoFullName)
      const orgInfo = {
        githubOrgId: bigPoppaOwnerObject.githubId,
        bigPoppaOrgId: bigPoppaOwnerObject.id
      }
      return DockerComposeClusterService.createClusterInstance(sessionUser, instanceDef, orgInfo, job.triggeredAction)
    })
    .then((instance) => {
      return DockerComposeCluster.findOneAndUpdateAsync({
        _id: job.cluster.id
      }, {
        $push: {
          instancesIds: instance._id
        }
      }).return(instance)
    })
    .then((instance) => {
      const newJob = Object.assign({
        instance: {
          id: instance._id.toString()
        }
      }, job)
      log.info({ newJob }, 'publish new event that instance was created')
      rabbitMQ.clusterInstanceCreated(newJob)
    })
}
