/**
 * Handle `cluster.instance.created` event
 * @module lib/workers/cluster.instance.created
 */
'use strict'

require('loadenv')()

const DockerComposeCluster = require('models/mongo/docker-compose-cluster')
const logger = require('logger')
const schemas = require('models/rabbitmq/schemas')

module.exports.jobSchema = schemas.clusterInstanceCreated

/**
 * Cluster instance created
 * @param {Object} job - Job info
 * @returns {Promise}
 */
module.exports.task = (job) => {
  const log = logger.child({ method: 'ClusterInstanceCreated', job })
  return DockerComposeCluster.findByIdAsync(job.cluster.id)
    .then((cluster) => {
      log.trace({ cluster }, 'fetched cluster')
      return cluster
    })
}
