/**
 * Handle `cluster.delete.multi` task
 * @module lib/workers/cluster.delete.multi
 */
'use strict'

require('loadenv')()
const ClusterConfigService = require('models/services/cluster-config-service')
const joi = require('utils/joi')

module.exports.jobSchema = joi.object({
  cluster: joi.object({
    id: joi.string().required()
  }).unknown().required()
}).unknown().required()

/**
 * Delete all clusters with same ICC
 * @param {Object} job - Job info
 * @returns {Promise}
 */
module.exports.task = (job) => {
  return ClusterConfigService.deleteAllICC(job.cluster.id)
}
