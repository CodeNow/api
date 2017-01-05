/**
 * Handle `cluster.create` task
 * @module lib/workers/cluster.create
 */
'use strict'

require('loadenv')()
const ClusterConfigService = require('models/services/cluster-config-service')
const joi = require('utils/joi')
const UserService = require('models/services/user-service')

module.exports.jobSchema = joi.object({
  sessionUserBigPoppaId: joi.number().required(),
  triggeredAction: joi.string().required().valid('user', 'webhook'),
  repoFullName: joi.string().required(),
  branchName: joi.string().required(),
  filePath: joi.string().required(),
  isTesting: joi.boolean().required(),
  newInstanceName: joi.string().required()
}).unknown().required()

/**
 * Create cluster
 * @param {Object} job - Job info
 * @returns {Promise}
 */
module.exports.task = (job) => {
  return UserService.getCompleteUserByBigPoppaId(job.sessionUserBigPoppaId)
    .then(function (sessionUser) {
      return ClusterConfigService.create(
        sessionUser,
        job.triggeredAction,
        job.repoFullName,
        job.branchName,
        job.filePath,
        job.isTesting,
        job.newInstanceName)
    })
}
