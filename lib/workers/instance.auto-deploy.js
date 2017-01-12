/**
 * Creates a new build for an instance based off of a webhook.
 * @module lib/workers/instance.auto-deploy
 */
'use strict'

require('loadenv')()

const BuildService = require('models/services/build-service')
const Instance = require('models/mongo/instance')
const joi = require('utils/joi')
const logger = require('logger')
const workerUtils = require('utils/worker-utils')

module.exports.jobSchema = joi.object({
  instanceShortHash: joi.string().required(),
  pushInfo: joi.object({
    repo: joi.string().required(),
    branch: joi.string().required(),
    commit: joi.string().required(),
    user: joi.object({
      id: joi.number().required()
    }).required()
  }).unknown().required()
}).unknown().required()

module.exports.maxNumRetries = 5
/**
 * Handles updating an instance to the match the given pushInfo.  This is usually called from the
 * webhooks
 * @param {Object} job                  - job model
 * @param {Object} job.instanceId       - Instance id to update and deploy
 * @param {Object} job.pushInfo         - Model containing GitHub push data
 * @param {String} job.pushInfo.repo    - Full Repository Name (owner/repo)
 * @param {String} job.pushInfo.branch  - Current branch this instance should be on
 * @param {String} job.pushInfo.commit  - New commit this instance should be on
 * @param {Object} job.pushInfo.user    - Model containing the pusher's data
 * @param {Number} job.pushInfo.user.id - GitHub ID for the pusher
 *
 * @resolves {Object} model       - Contains the user and the new build
 * @resolves {Object} model.user  - User model for the pusher
 * @resolves {Object} model.build - Newly created build model
 *
 * @throws {WorkerStopError} When the instance could not be found
 */
module.exports.task = (job) => {
  const log = logger.child({ method: 'InstanceAutoDeployWorker', job })
  return Instance.findByIdAsync(job.instanceId)
    .tap(workerUtils.assertFound(job, 'Instance'))
    .tap(function (instance) {
      log.info('instance found')
      return BuildService.createAndBuildContextVersion(instance, job.pushInfo, 'autodeploy')
    })
}
