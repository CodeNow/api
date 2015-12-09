/**
 * Handle `dock.removed` event from mavis
 *  - get all instance on the dock
 *  - redeploy those instances
 * @module lib/workers/dock.removed
 */
'use strict'

require('loadenv')()

var keypather = require('keypather')()
var rabbitMQ = require('models/rabbitmq')
var Promise = require('bluebird')
var ContextVersion = require('models/mongo/context-version')

var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var joi = require('utils/joi')
var TaskFatalError = require('ponos').TaskFatalError
var log = require('middlewares/logger')(__filename).log

module.exports = DockRemovedWorker

/**
 * Main handler for docker unhealthy event
 * Should redeploy all containers on unhealthy dock
 * Should mark the dock removed on every context version that runs on that dock
 * Should mark stopping instances as stopped on that dock since the instances are technically stopped now.
 * @param {Object} job - Job info
 * @returns {Promise}
 */
function DockRemovedWorker (job) {
  var logData = {
    tx: true,
    data: job
  }
  var schema = joi.object({
    host: joi.string().required(),
    githubId: joi.number()
  })
  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(err)
    })
    .then(log.trace.bind(log, logData, 'DockRemovedWorker handle'))
    .then(function () {
      return Promise.fromCallback(function (cb) {
        ContextVersion.markDockRemovedByDockerHost(job.host, cb)
      })
    })
    .then(function () {
      return Promise.fromCallback(function (cb) {
        Instance.setStoppingAsStoppedByDockerHost(job.host, cb)
      })
    })
    .then(function () {
      return Promise.fromCallback(function (cb) {
        Instance.findInstancesByDockerHost(job.host, cb)
      })
    })
    .then(function (instances) {
      log.trace(logData, 'DockRemovedWorker - Instances found ' + instances.length)
      if (instances.length > 0) {
        DockRemovedWorker._redeployContainers(instances)
        return DockRemovedWorker._updateFrontendInstances(instances)
      }
    })
}

/**
 * should find running instances and submit job to redeploy them
 * @param {Array}    instances array of instances on the dock
 */
DockRemovedWorker._redeployContainers = function (instances) {
  instances = instances || []
  var instancesToRedeploy = instances.filter(function (instance) {
    var container = instance.container
    if (!container) {
      return false
    }
    return keypather.get(container, 'inspect.State.Running') === true
  })
  // we creating job for all instances right now
  // job will check internally if it's valid
  // if job failed validation it will quit
  // we can change that later on and fetch more data here and then create
  // jobs only for valid data
  instancesToRedeploy.forEach(function (instance) {
    rabbitMQ.redeployInstanceContainer({
      instanceId: instance._id,
      sessionUserGithubId: process.env.HELLO_RUNNABLE_GITHUB_ID
    })
  })
}

DockRemovedWorker._updateFrontendInstances = function (instances) {
  return Promise.all(
    instances
      .map(function (instance) {
        return InstanceService.emitInstanceUpdate(instance, null, 'update', true)
      })
  )
}
