/**
 * Handle `dock.removed` event from mavis
 *  - get all instance on the dock
 *  - redeploy those instances
 * @module lib/workers/dock.removed
 */
'use strict'
require('loadenv')()
var ContextVersion = require('models/mongo/context-version')
var errors = require('errors')
var Promise = require('bluebird')
var rabbitMQ = require('models/rabbitmq')
var url = require('url')
var uuid = require('node-uuid')

var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var PermissionService = require('models/services/permission-service')
var joi = require('utils/joi')
var WorkerStopError = require('error-cat/errors/worker-stop-error')
var logger = require('logger')
var workerUtils = require('utils/worker-utils')

module.exports = DockRemovedWorker

var schema = joi.object({
  host: joi.string().uri({ scheme: 'http' }).required(),
  githubId: joi.number(),
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
function DockRemovedWorker (job) {
  var log = logger.child({ method: 'DockRemovedWorker' })
  log.info('DockRemovedWorker called')
  return workerUtils.validateJob(job, schema)
    .then(function () {
      // add deploymentUuid that we will pass to all subsequent workers
      job.deploymentUuid = uuid.v4()
      return ContextVersion.markDockRemovedByDockerHost(job.host)
        .then(function () {
          // These 2 tasks can run in parallel
          return Promise.all([
            DockRemovedWorker._redeployAndNotify(job),
            DockRemovedWorker._rebuildAndNotify(job)
          ])
        })
        .finally(function () {
          rabbitMQ.asgInstanceTerminate({
            ipAddress: url.parse(job.host).hostname
          })
        })
    })
}

/**
 * Redeploy instances that should be redeployed and send notification for each of them
 * @param {Object} job job data
 * @returns {Promise}
 */
DockRemovedWorker._redeployAndNotify = function (job) {
  return DockRemovedWorker._redeploy(job)
    .then(DockRemovedWorker._updateFrontendInstances)
}

/**
 * Rebuild instances that should be rebuild and send notification for each of them
 * @param {Object} job job data
 * @returns {Promise}
 */
DockRemovedWorker._rebuildAndNotify = function (job) {
  return DockRemovedWorker._rebuild(job)
    .then(DockRemovedWorker._updateFrontendInstances)
}

/**
 * Find all instances that should be redeployed (built but not stopped or crashed) and create new job for each of them
 * @param {Object} job job data
 * @returns {Promise}
 */
DockRemovedWorker._redeploy = function (job) {
  var log = logger.child({ method: 'DockRemovedWorker._redeploy' })
  log.info('DockRemovedWorker._redeploy called')
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
DockRemovedWorker._rebuild = function (job) {
  var log = logger.child({ method: 'DockRemovedWorker._rebuild' })
  log.info('DockRemovedWorker._rebuild called')
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
          var payload = {
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
DockRemovedWorker._updateFrontendInstances = function (instances) {
  var log = logger.child({ method: 'DockRemovedWorker._updateFrontendInstances' })
  log.info({
    count: instances.length
  }, 'DockRemovedWorker._updateFrontendInstances called')
  return Promise.all(
    instances
      .map(function (instance) {
        return InstanceService.emitInstanceUpdate(instance, null, 'update', true)
      })
  )
}
