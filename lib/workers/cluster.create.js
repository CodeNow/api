/**
 * Handle `cluster.create` task
 * @module lib/workers/cluster.create
 */
'use strict'

require('loadenv')()
const DockerComposeClusterService = require('models/services/docker-compose-cluster-service')
const joi = require('utils/joi')
const User = require('models/mongo/user')

module.exports.jobSchema = joi.object({
  sessionUserGithubId: joi.number().required(),
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
  return User.findByGithubIdAsync(job.sessionUserGithubId)
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
