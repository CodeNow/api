/**
 * Handler `on-dock-removed` event from mavis
 *  - get all instance on the dock
 *  - redeploy those instances
 * @module lib/workers/on-dock-removed
 */
'use strict'

require('loadenv')()

var rabbitMQ = require('models/rabbitmq')
var Promise = require('bluebird')
var ContextVersion = require('models/mongo/context-version')

var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var joi = require('utils/joi')
var TaskFatalError = require('ponos').TaskFatalError
var log = require('middlewares/logger')(__filename).log

module.exports = OnDockRemovedWorker

/**
 * Main handler for docker unhealthy event
 * Should redeploy all containers on unhealthy dock
 * Should mark the dock removed on every context version that runs on that dock
 * Should mark stopping instances as stopped on that dock since the instances are technically stopped now.
 * @param {Object} job - Job info
 * @returns {Promise}
 */
function OnDockRemovedWorker (job) {
  job = job || true // Do this so joi will trigger validation failure on empty job
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
    .then(log.trace.bind(log, logData, 'OnDockRemovedWorker handle'))
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
        Instance.findActiveInstancesByDockerHost(job.host, cb)
      })
    })
    .then(function (instances) {
      log.trace(logData, 'OnDockRemovedWorker - Instances found ' + instances.length)
      if (instances.length > 0) {
        OnDockRemovedWorker._redeployContainers(instances)
        return OnDockRemovedWorker._updateFrontendInstances(instances)
      }
    })
    .catch(function (e) {
      log.trace(logData, 'OnDockRemovedWorker - final error ' + e)
      throw e
    })
}

/**
 * should redeploy all instances passed in
 * @param {Array}    instances       array of instances to redeploy
 */
OnDockRemovedWorker._redeployContainers = function (instances) {
  // we creating job for all instances right now
  // job will check internally if it's valid
  // if job failed validation it will quit
  // we can change that later on and fetch more data here and then create
  // jobs only for valid data
  instances.forEach(function (instance) {
    rabbitMQ.redeployInstanceContainer({
      instanceId: instance._id,
      sessionUserGithubId: process.env.HELLO_RUNNABLE_GITHUB_ID
    })
  })
}

OnDockRemovedWorker._updateFrontendInstances = function (instances) {
  return Promise.all(
    instances
      .map(function (instance) {
        return InstanceService.emitInstanceUpdate(instance, null, 'update', true)
      })
  )
}
