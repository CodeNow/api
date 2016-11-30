/**
 * Handle `cluster.delete` task
 * @module lib/workers/cluster.delete
 */
'use strict'

require('loadenv')()
const DockerComposeClusterService = require('models/services/docker-compose-cluster-service')
const joi = require('utils/joi')

module.exports.jobSchema = joi.object({
  cluster: joi.object({
    id: joi.string().required()
  }).unknown().required()
}).unknown().required()

/**
 * Delete cluster
 * @param {Object} job - Job info
 * @returns {Promise}
 */
module.exports.task = (job) => {
  return DockerComposeClusterService.delete(job.cluster.id)
}
