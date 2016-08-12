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
        _redeployAndNotify(job),
        _rebuildAndNotify(job)
      ])
    })
    .finally(function () {
      rabbitMQ.asgInstanceTerminate({
        ipAddress: url.parse(job.host).hostname
      })
    })
}

/**
 * Redeploy instances that should be redeployed and send notification for each of them
 * @param {Object} job job data
 * @returns {Promise}
 */
const _redeployAndNotify = module.exports._redeployAndNotify = function (job) {
  return _redeploy(job).then(_updateFrontendInstances)
}

/**
 * Rebuild instances that should be rebuild and send notification for each of them
 * @param {Object} job job data
 * @returns {Promise}
 */
const _rebuildAndNotify = module.exports._rebuildAndNotify = function (job) {
  return _rebuild(job).then(_updateFrontendInstances)
}

/**
 * Find all instances that should be redeployed (built but not stopped or crashed) and create new job for each of them
 * @param {Object} job job data
 * @returns {Promise}
 */
const _redeploy = module.exports._redeploy = function (job) {
  const log = logger.child({ method: '_redeploy' })
  log.info('_redeploy called')
  return Instance.findInstancesBuiltByDockerHostAsync(job.host)
    .each(function (instance) {
      return PermissionService.checkOwnerAllowed(instance)
        .catch(errors.OrganizationNotAllowedError, function (err) {
          log.error({ instance: instance, err: err }, 'Organization is not allowed, no need to redeploy')
          throw new WorkerStopError('Organization is not allowed, no need to redeploy', { originalError: err })
        })
        .catch(errors.OrganizationNotFoundError, function (err) {
          log.error({ instance: instance, err: err }, 'Organization is not whitelisted, no need to redeploy')
          throw new WorkerStopError('Organization is not whitelisted, no need to redeploy', { originalError: err })
        })
        .then(function () {
          log.trace('found instance to redeploy')
          rabbitMQ.redeployInstanceContainer({
            instanceId: instance._id,
            sessionUserGithubId: process.env.HELLO_RUNNABLE_GITHUB_ID,
            deploymentUuid: job.deploymentUuid
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
const _rebuild = module.exports._rebuild = function (job) {
  const log = logger.child({ method: '_rebuild' })
  log.info('_rebuild called')
  return Instance.findInstancesBuildingOnDockerHostAsync(job.host)
    .each(function (instance) {
      return PermissionService.checkOwnerAllowed(instance)
        .catch(errors.OrganizationNotAllowedError, function (err) {
          log.error({ instance: instance }, 'Organization is not allowed, no need to rebuild')
          throw new WorkerStopError('Organization is not allowed, no need to rebuild', { originalError: err })
        })
        .catch(errors.OrganizationNotFoundError, function (err) {
          log.error({ instance: instance }, 'Organization is not whitelisted, no need to rebuild')
          throw new WorkerStopError('Organization is not whitelisted, no need to rebuild', { originalError: err })
        })
        .then(function () {
          log.trace('found instance to rebuild')
          const payload = {
            instanceId: instance._id,
            deploymentUuid: job.deploymentUuid
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
const _updateFrontendInstances = module.exports._updateFrontendInstances = function (instances) {
  const log = logger.child({ method: '_updateFrontendInstances' })
  log.info({
    count: instances.length
  }, '_updateFrontendInstances called')
  return Promise.all(
    instances
      .map(function (instance) {
        return InstanceService.emitInstanceUpdate(instance, null, 'update', true)
      })
  )
}
