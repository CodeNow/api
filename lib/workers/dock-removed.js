/**
 * Respond to dock-unhealthy event from docker-listener
 *  - get running containers on dock
 *  - redeploy those containers
 * @module lib/workers/on-dock-removed
 */
'use strict'

require('loadenv')()
var Runnable = require('runnable')
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
        Instance.findActiveInstancesByDockerHost(job.host, cb)
      })
    })
    .then(function (instances) {
      log.trace(logData, 'DockRemovedWorker - Instances found ' + instances.length)
      if (instances.length > 0) {
        return Promise.all([
          DockRemovedWorker._redeployContainers(instances),
          DockRemovedWorker._updateFrontendInstances(instances)
        ])
      }
    })
    .catch(function (e) {
      log.trace(logData, 'DockRemovedWorker - ERROR! ' + e)
      throw e
    })
}

/**
 * should redeploy all instances passed in
 * @param {Array} instances array of instances to start
 * @returns {Promise}
 * @private
 */
DockRemovedWorker._redeployContainers = function (instances) {
  var runnableClient = new Runnable(process.env.FULL_API_DOMAIN, {
    requestDefaults: {
      headers: {
        'user-agent': 'worker-on-dock-removed'
      }
    }
  })
  return Promise.fromCallback(function (cb) {
    // TODO: remove once we have redeploy worker
    return runnableClient.githubLogin(process.env.HELLO_RUNNABLE_GITHUB_TOKEN, cb)
  })
    .then(function () {
      return Promise.all(
        instances
          .map(function (instance) {
            var instanceModel = runnableClient.newInstance(instance.shortHash)
            return Promise.fromCallback(function (cb) {
              instanceModel.redeploy({
                qs: {
                  rollingUpdate: true
                }
              }, cb)
            })
          })
      )
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
