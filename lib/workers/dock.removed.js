/**
 * Handle `dock.removed` event from
 *  - get all instance on the dock
 *  - redeploy those instances
 * @module lib/workers/dock.removed
 */
'use strict'
require('loadenv')()
const ContextVersion = require('models/mongo/context-version')
const errors = require('errors')
const Promise = require('bluebird')
const rabbitMQ = require('models/rabbitmq')
const url = require('url')
const uuid = require('node-uuid')

const Instance = require('models/mongo/instance')
const InstanceService = require('models/services/instance-service')
const PermissionService = require('models/services/permission-service')
const joi = require('utils/joi')
const WorkerStopError = require('error-cat/errors/worker-stop-error')
const logger = require('logger')

module.exports.jobSchema = joi.object({
  host: joi.string().uri({ scheme: 'http' }).required(),
  tid: joi.string()
}).unknown().required().label('dock.removed job')

/**
 * Main handler for docker unhealthy event
 * Should mark the dock removed on every context version that runs on that dock
 * Should mark stopping instances as stopped on that dock since the instances are technically stopped now
 * Should redeploy all running or starting containers on unhealthy dock
 * Should rebuild all building containers
 * @param {Object} job - Job info
 * @returns {Promise}
 */
module.exports.task = function (job) {
  job.deploymentUuid = uuid.v4()
  return ContextVersion.markDockRemovedByDockerHost(job.host)
    .then(function () {
      // These 2 tasks can run in parallel
      return Promise.all([
        redeploy(job).then(updateFrontendInstances),
        rebuild(job).then(updateFrontendInstances)
      ])
    })
    .finally(function () {
      rabbitMQ.asgInstanceTerminate({
        ipAddress: url.parse(job.host).hostname
      })
    })
}

const checkInstance = function (instance) {
  const log = logger.child({ method: 'checkInstance' })
  log.info('checkInstance called')
  return PermissionService.checkOwnerAllowed(instance)
    .catch(errors.OrganizationNotAllowedError, function (err) {
      log.error({ instance: instance, err: err }, 'Organization is not allowed, no need to redeploy/rebuild')
      throw new WorkerStopError('Organization is not allowed, no need to redeploy/rebuild', { originalError: err })
    })
    .catch(errors.OrganizationNotFoundError, function (err) {
      log.error({ instance: instance, err: err }, 'Organization is not whitelisted, no need to redeploy/rebuild')
      throw new WorkerStopError('Organization is not whitelisted, no need to redeploy/rebuild', { originalError: err })
    })
}

/**
 * Find all instances that should be redeployed (built but not stopped or crashed) and create new job for each of them
 * @param {Object} job job data
 * @returns {Promise}
 */
const redeploy = function (job) {
  const log = logger.child({ method: 'redeploy', job: job })
  log.info('redeploy called')
  return Instance.findInstancesBuiltByDockerHost(job.host)
    .each(function (instance) {
      return checkInstance(instance)
        .then(function () {
          rabbitMQ.redeployInstanceContainer({
            instanceId: instance._id,
            sessionUserGithubId: process.env.HELLO_RUNNABLE_GITHUB_ID,
            deploymentUuid: job.deploymentUuid,
            tid: job.tid
          })
          return instance
        })
    })
}

/**
 * Find all instances that should be rebuild and create new job for each of them
 * @param {Object} job job data
 * @returns {Promise}
 */
const rebuild = function (job) {
  const log = logger.child({ method: 'rebuild', job: job })
  log.info('rebuild called')
  return Instance.findInstancesBuildingOnDockerHost(job.host)
    .each(function (instance) {
      return checkInstance(instance)
        .then(function () {
          const payload = {
            instanceId: instance._id,
            deploymentUuid: job.deploymentUuid,
            tid: job.tid
          }
          rabbitMQ.publishInstanceRebuild(payload)
          return instance
        })
    })
}

/**
 * send events to update frontend instances
 * @param {Array} instances array of instances that were updated
 * @returns {Promise}
 * @private
 */
const updateFrontendInstances = function (instances) {
  const log = logger.child({ method: 'updateFrontendInstances' })
  log.info({
    count: instances.length
  }, 'updateFrontendInstances called')
  return Promise.all(
    instances
      .map(function (instance) {
        return InstanceService.emitInstanceUpdate(instance, null, 'update', true)
      })
  )
}
