/**
 * Handle `cluster.create` task
 * @module lib/workers/cluster.create
 */
'use strict'

require('loadenv')()
const DockerComposeClusterService = require('models/services/docker-compose-cluster-service')
const joi = require('utils/joi')
const UserService = require('models/services/user-service')

module.exports.jobSchema = joi.object({
  sessionUserBigPoppaId: joi.number().required(),
  triggeredAction: joi.string().required().valid('user', 'webhook'),
  repoFullName: joi.string().required(),
  branchName: joi.string().required(),
  dockerComposeFilePath: joi.string().required(),
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
      return DockerComposeClusterService.create(
        sessionUser,
        job.triggeredAction,
        job.repoFullName,
        job.branchName,
        job.dockerComposeFilePath,
        job.newInstanceName)
    })
}
