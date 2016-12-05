/**
 * Handle `cluster.created` event
 * @module lib/workers/cluster.created
 */
'use strict'

require('loadenv')()

const Promise = require('bluebird')
const DockerComposeClusterService = require('models/services/docker-compose-cluster-service')
const rabbitMQ = require('models/rabbitmq')
const schemas = require('models/rabbitmq/schemas')
const UserService = require('models/services/user-service')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

module.exports.jobSchema = schemas.clusterCreated

/**
 * Cluster created event
 * @param {Object} job - Job info
 * @returns {Promise}
 */
module.exports.task = (job) => {
  const parsedInstances = job.parsedCompose.results
  const mainInstanceDef = parsedInstances.find((inst) => {
    return inst.metadata.isMain
  })
  return Promise.try(() => {
    if (!mainInstanceDef) {
      throw new WorkerStopError('Job has no main instance')
    }
  })
  .then(() => {
    return UserService.getCompleteUserByBigPoppaId(job.sessionUserBigPoppaId)
      .then(function (sessionUser) {
        return DockerComposeClusterService.createClusterParent(sessionUser, mainInstanceDef, job.repoFullName)
      })
      .then(function (parentInstance) {
        const newJob = Object.assign({}, job)
        newJob.instance = {
          id: parentInstance._id.toString()
        }
        rabbitMQ.clusterParentInstanceCreated(newJob)
      })
  })
}
