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
var joi = require('utils/joi')
var TaskFatalError = require('ponos').TaskFatalError
var log = require('middlewares/logger')(__filename).log

module.exports = OnDockRemovedWorker

/**
 * Main handler for docker unhealthy event
 * Should redeploy all containers on unhealthy dock
 * Should mark the dock removed on every context version that runs on that dock
 * Should mark stopping instances as stopped on that dock
 * @param {Object} job - Job infor
 * @returns {Promise}
 */
function OnDockRemovedWorker (job) {
  job = job || true // Do this so joi will trigger validation failure on empty job
  var logData = {
    tx: true,
    data: job
  }
  var schema = joi.object({
    host: joi.string().required()
  })
  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(err)
    })
    .then(function () {
      var dockerHost = job.host
      log.trace(logData, 'OnDockRemovedWorker handle')
      var removedActiveInstances = Instance.findActiveInstancesByDockerHostAsync(dockerHost)
        .then(function (instances) {
          if (instances.length > 0) {
            return OnDockRemovedWorker._redeployContainers(instances)
          }
        })
      return Promise.all(
        [
          removedActiveInstances,
          ContextVersion.markDockRemovedByDockerHostAsync(dockerHost),
          Instance.setStoppingAsStoppedByDockerHostAsync(dockerHost)
        ].map(function (promise) {
          // Make sure that all the promises finish, don't short-circuit if one part fails
          return promise.reflect() // http://bluebirdjs.com/docs/api/reflect.html
        })
      )
      .then(function (inspections) {
        return Instance.emitInstanceUpdatesAsync(null, {'container.dockerHost': dockerHost}, 'update')
          .return(inspections)
      })
      .then(function (inspections) {
        // If an exception has occurred throw that as an error
        inspections.forEach(function (inspection) {
          if (!inspection.isFulfilled()) {
            throw inspection.reason()
          }
        })
      })
    })
}

/**
 * should redeploy all instances passed in
 * @param {Array} instances array of instances to start
 * @returns {Promise}
 * @private
 */
OnDockRemovedWorker._redeployContainers = function (instances) {
  var runnableClient = new Runnable(process.env.FULL_API_DOMAIN, {
    requestDefaults: {
      headers: {
        'user-agent': 'worker-on-dock-removed'
      }
    }
  })
  return Promise.fromCallback(function (cb) {
    return runnableClient.githubLogin(process.env.HELLO_RUNNABLE_GITHUB_TOKEN, cb)
  })
    .then(function () {
      return Promise.all(
        instances
          .map(function (instance) {
            var instanceModel = runnableClient.newInstance(instance.shortHash)
            return instanceModel.redeployAsync({
              qs: {
                rollingUpdate: true
              }
            }).reflect()
          })
      )
        .then(function (inspections) {
          inspections.forEach(function (inspection) {
            if (!inspection.isFulfilled()) {
              throw inspection.reason()
            }
          })
        })
    })
}
