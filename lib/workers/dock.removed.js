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

var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var joi = require('utils/joi')
var TaskFatalError = require('ponos').TaskFatalError
var log = require('middlewares/logger')(__filename).log

module.exports = DockRemovedWorker

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
  var schema = joi.object({
    host: joi.string().uri({ scheme: 'http' }).required(),
    githubId: joi.number()
  }).unknown().required().label('job')
  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(
        'dock.removed',
        'Job failed validation',
        { err: err }
      )
    })
    .then(log.trace.bind(log, logData, 'DockRemovedWorker handle'))
    .then(function () {
      // add deploymentUuid that we will pass to all subsequent workers
      job.deploymentUuid = uuid.v4()
      return Promise.fromCallback(function (cb) {
        ContextVersion.markDockRemovedByDockerHost(job.host, cb)
      })
      .then(function () {
        // First, stop all `stopping` instances
        return DockRemovedWorker._stopStoppingInstances(job)
      })
      .then(function () {
        // These 2 tasks can run in parallel
        return Promise.all([
          DockRemovedWorker._redeploy(job),
          DockRemovedWorker._rebuild(job)
        ])
      })
      .then(function () {
        // Update instances
        return Instance.findInstancesByDockerHost(job.host)
          .then(function (instances) {
            return DockRemovedWorker._updateFrontendInstances(instances)
          })
      })
      .finally(function () {
        rabbitMQ.asgInstanceTerminate({
          ipAddress: url.parse(job.host).hostname
        })
      })
    })
}

/**
 * Mark all stopping instances as stopped
 * @param {Object} job job data
 * @returns {Promise}
 */
DockRemovedWorker._stopStoppingInstances = function (job) {
  return Instance.setStoppingAsStoppedByDockerHostAsync(job.host)
}

/**
 * Redeploy instances that should be redeployed and send notification for each of them
 * @param {Object} job job data
 * @returns {Promise}
 */
DockRemovedWorker._redeployAndNotify = function (job) {
  return DockRemovedWorker._redeploy(job)
    .then(function (instances) {
      return DockRemovedWorker._updateFrontendInstances(instances)
    })
}

/**
 * Rebuild instances that should be rebuild and send notification for each of them
 * @param {Object} job job data
 * @returns {Promise}
 */
DockRemovedWorker._rebuildAndNotify = function (job) {
  return DockRemovedWorker._rebuild(job)
    .then(function (instances) {
      return DockRemovedWorker._updateFrontendInstances(instances)
    })
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
  return Instance.findInstancesBuilByDockerHostAsync(job.host)
    .then(function (instances) {
      log.trace(logData, '_redeploy found instances to redeploy')
      DockRemovedWorker._redeployContainers(instances, job.deploymentUuid)
      return instances
    })
}

/**
 * should redeploy all instances
 * @param {Array}  instances  instances array to redeploy
 * @param {String} deploymentUuid to keep track of workers flow
 * @returns {Promise}
 */
DockRemovedWorker._redeployContainers = function (instances, deploymentUuid) {
  instances.forEach(function (instance) {
    rabbitMQ.redeployInstanceContainer({
      instanceId: instance._id,
      sessionUserGithubId: process.env.HELLO_RUNNABLE_GITHUB_ID,
      deploymentUuid: deploymentUuid
    })
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
    .then(function (instances) {
      log.trace(logData, '_rebuild found instances to rebuild')
      DockRemovedWorker._rebuildInstances(instances, job.deploymentUuid)
      return instances
    })
}

/**
 * should rebuild all instances with not completed builds (and not failed)
 * @param {Array} instances array of instances to be rebuild
 * @param {String} deploymentUuid to keep track of workers flow
 * @returns {Promise}
 * @private
 */
DockRemovedWorker._rebuildInstances = function (instances, deploymentUuid) {
  instances.forEach(function (instance) {
    var payload = {
      instanceId: instance._id,
      deploymentUuid: deploymentUuid
    }
    rabbitMQ.publishInstanceRebuild(payload)
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
