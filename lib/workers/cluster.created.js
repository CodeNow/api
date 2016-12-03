/**
 * Handle `cluster.created` event
 * @module lib/workers/cluster.created
 */
'use strict'

require('loadenv')()

// const DockerComposeClusterService = require('models/services/docker-compose-cluster-service')
const schemas = require('models/rabbitmq/schemas')

module.exports.jobSchema = schemas.clusterCreated

/**
 * Cluster event
 * @param {Object} job - Job info
 * @returns {Promise}
 */
module.exports.task = (job) => {
  // DockerComposeClusterService.createClusterParent()
  return job
}
