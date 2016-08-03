/**
 * Handle `dock.removed` event from mavis
 *  - get all instance on the dock
 *  - redeploy those instances
 * @module lib/workers/dock.removed
 */
'use strict'

require('loadenv')()

var rabbitMQ = require('models/rabbitmq')
var Promise = require('bluebird')
var ContextVersion = require('models/mongo/context-version')
var url = require('url')
var uuid = require('node-uuid')
var errors = require('errors')

var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var joi = require('utils/joi')
var log = require('middlewares/logger')(__filename).log
var workerUtils = require('utils/worker-utils')

module.exports = DockRemovedWorker

var schema = joi.object({
  host: joi.string().uri({ scheme: 'http' }).required(),
  githubId: joi.number(),
  tid: joi.string()
}).unknown().required().label('dock.removed job')

var queueName = 'dock.removed'

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
  var logData = {
    tx: true,
    data: job
  }
  return workerUtils.validateJob(queueName, job, schema)
    .then(function () {
      // add deploymentUuid that we will pass to all subsequent workers
      job.deploymentUuid = uuid.v4()
      log.trace(logData, 'DockRemovedWorker handle')
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
  var logData = {
    tx: true,
    job: job
  }
  log.info(logData, 'DockRemovedWorker._redeploy')
  return Instance.findInstancesBuiltByDockerHostAsync(job.host)
    .each(function (instance) {
      return PermissionService.checkOwnerAllowed(instance)
        .catch(errors.OrganizationNotAllowedError, function (err) {
          log.info({ instance: instance, err: err }, 'Organization is not allowed, no need to redeploy')
        })
        .catch(errors.OrganizationNotFoundError, function (err) {
          log.info({ instance: instance, err: err }, 'Organization is not whitelisted, no need to redeploy')
        })
        .then(function () {
          log.trace(logData, '_redeploy found instance to redeploy')
          rabbitMQ.redeployInstanceContainer({
            instanceId: instance._id,
            sessionUserGithubId: process.env.HELLO_RUNNABLE_GITHUB_ID,
            deploymentUuid: job.deploymentUuid
          })
        }).return(instance)
    })
}

/**
 * Find all instances that should be rebuild and create new job for each of them
 * @param {Object} job job data
 * @returns {Promise}
 */
DockRemovedWorker._rebuild = function (job) {
  var logData = {
    tx: true,
    job: job
  }
  log.info(logData, 'DockRemovedWorker._rebuild')
  return Instance.findInstancesBuildingOnDockerHostAsync(job.host)
    .each(function (instance) {
      return PermissionService.checkOwnerAllowed(instance)
        .catch(errors.OrganizationNotAllowedError, function (err) {
          log.info({ instance: instance }, 'Organization is not allowed, no need to rebuild')
        })
        .catch(errors.OrganizationNotFoundError, function (err) {
          log.info({ instance: instance }, 'Organization is not whitelisted, no need to rebuild')
        })
        .then(function () {
          log.trace(logData, '_rebuild found instance to rebuild')
          var payload = {
            instanceId: instance._id,
            deploymentUuid: job.deploymentUuid
          }
          rabbitMQ.publishInstanceRebuild(payload)
        }).return(instance)
    })
}

/**
 * send events to update frontend instances
 * @param {Array} instances array of instances that were updated
 * @returns {Promise}
 * @private
 */
DockRemovedWorker._updateFrontendInstances = function (instances) {
  log.info({
    tx: true,
    count: instances.length
  }, 'DockRemovedWorker._updateFrontendInstances')
  return Promise.all(
    instances
      .map(function (instance) {
        return InstanceService.emitInstanceUpdate(instance, null, 'update', true)
      })
  )
}
