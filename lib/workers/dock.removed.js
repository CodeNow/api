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
var put = require('101/put')
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
    // .then(function () {
    //   log.trace(logData, 'handle redeploy')
    //   return Promise.fromCallback(function (cb) {
    //     Instance.findInstancesByDockerHost(job.host, function (err, instances) {
    //       if (err) {
    //         log.error(put({ err: err }, logData), 'failed to found instances to redeploy')
    //         return cb(err)
    //       }
    //       log.trace(logData, 'found instances to redeploy')
    //       DockRemovedWorker._redeployContainers(instances)
    //       cb(null, instances)
    //     })
    //   })
    // })
    .then(function () {
      log.trace(logData, 'handle rebuild')
      return Promise.fromCallback(function (cb) {
        Instance.findInstancesBuildingOnDockerHost(job.host, function (err, instances) {
          if (err) {
            log.error(put({ err: err }, logData), 'failed to found instances to rebuild')
            return cb(err)
          }
          log.trace(logData, 'found instances to rebuild')
          DockRemovedWorker._rebuildInstances(instances)
          cb(null, instances)
        })
      })
    })
    // .then(DockRemovedWorker._populateInstancesBuilds.bind(DockRemovedWorker))
    // .then(function (instances) {
    //   log.trace(logData, 'DockRemovedWorker - Instances found ' + instances.length)
    //   if (instances.length > 0) {
    //     return DockRemovedWorker._updateFrontendInstances(instances)
    //   }
    // })
}

/**
 * should fetch build for each instance
 * @param {Array} instances array to be populated
 * @returns {Promise}
 * @private
 */
DockRemovedWorker._populateInstancesBuilds = function (instances) {
  instances = instances || []
  return Promise.all(
    instances.map(function (instance) {
      return Promise.fromCallback(function (cb) {
        instance.populateModels(cb)
      })
    })
  )
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
/**
 * should rebuild all instances with not completed builds (and not failed)
 * @param {Array} instances array of instances to be rebuild
 * @returns {Promise}
 * @private
 */
DockRemovedWorker._rebuildInstances = function (instances) {
  instances = instances || []
  // var instanceToRebuild = instances.filter(function (instance) {
  //   return !keypather.get(instance, 'build.completed') && !keypather.get(instance, 'build.failed')
  // })
  instances.forEach(function (instance) {
    var payload = {
      instanceId: instance._id,
      instanceShortHash: instance.shortHash
    }
    rabbitMQ.publishInstanceRebuild(payload)
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
