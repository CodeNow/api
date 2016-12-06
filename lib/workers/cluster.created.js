/**
 * Handle `cluster.created` event
 * @module lib/workers/cluster.created
 */
'use strict'

require('loadenv')()

const schemas = require('models/rabbitmq/schemas')

module.exports.jobSchema = schemas.clusterCreated

/**
 * Cluster event
 * @param {Object} job - Job info
 * @returns {Promise}
 */
module.exports.task = (job) => {
  return job
}
