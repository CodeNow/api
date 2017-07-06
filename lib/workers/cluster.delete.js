/**
 * Handle `cluster.delete` task
 * @module lib/workers/cluster.delete
 */
'use strict'

require('loadenv')()
const ClusterConfigService = require('models/services/cluster-config-service')
const joi = require('utils/joi')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

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
  return ClusterConfigService.delete(job.cluster.id)
    .catch((err) => {
      throw new WorkerStopError('Could not delete cluster', { err })
    })
}
