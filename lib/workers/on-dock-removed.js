/**
 * Respond to dock-unhealthy event from docker-listener
 *  - get running containers on dock
 *  - redeploy those containers
 * @module lib/workers/on-dock-removed
 */
'use strict'

require('loadenv')()
var Runnable = require('runnable')
var async = require('async')
var domain = require('domain')
var put = require('101/put')
var util = require('util')
var Promise = require('bluebird')

var BaseWorker = require('workers/base-worker')
var ContextVersion = require('models/mongo/context-version')
var Instance = require('models/mongo/instance')
var error = require('error')
var log = require('middlewares/logger')(__filename).log

module.exports = OnDockRemovedWorker

module.exports.worker = function (data, done) {
  log.info({
    tx: true,
    data: data
  }, 'OnDockRemovedWorker module.exports.worker')
  var workerDomain = domain.create()
  workerDomain.runnableData = BaseWorker.getRunnableData()
  workerDomain.on('error', function (err) {
    log.fatal({
      tx: true,
      data: data,
      err: err
    }, 'on-dock-removed domain error')
    error.workerErrorHandler(err, data)
    // ack job and clear to prevent loop
    done()
  })
  workerDomain.run(function () {
    log.info(put({
      tx: true
    }, data), 'hermes.subscribe on-dock-removed start')
    var worker = new OnDockRemovedWorker(data)
    worker.handle(done)
  })
}

function OnDockRemovedWorker () {
  log.info('OnDockRemovedWorker constructor')
  this.runnableClient = new Runnable(process.env.FULL_API_DOMAIN, {
    requestDefaults: {
      headers: {
        'user-agent': 'worker-on-dock-removed'
      }
    }
  })
  BaseWorker.apply(this, arguments)
}

util.inherits(OnDockRemovedWorker, BaseWorker)

/**
 * main handler for docker unhealthy event
 * should redeploy all containers on unhealthy dock
 * @param {Function} done finishes worker
 */
OnDockRemovedWorker.prototype.handle = function (done) {
  var self = this
  var dockerHost = this.data.host
  log.info(this.logData, 'OnDockRemovedWorker handle')
  self.runnableClient
    .githubLogin(process.env.HELLO_RUNNABLE_GITHUB_TOKEN,
      function (err) {
        if (err) {
          log.error(put({
            err: err
          }, self.logData), 'OnDockRemovedWorker handle: githubLogin err')
          return done()
        }

        // Need to find all context-versions that are Running, Building, Stopped,
        // Stopping, Crashed, Starting and Pulling on this dock.
        // We then need to update every context-version to add a dockRemoved flag.
        // We also need to update every Stopping container to the Stopped state.
        var cleanupContextVersionsPromise = ContextVersion.findByDockerHostAsync(dockerHost)
          .then(function (contextVersions) {
            if (contextVersions.length > 0) {
              return Promise.all([
                self._markContextVersionsDockRemove(contextVersions),
                self._markStoppingContextVersionsAsStopped(contextVersions)
              ])
            }
          })

        var removedActiveInstances = Instance.findActiveInstancesByDockerHostAsync(dockerHost)
          .then(function (instances) {
            if (instances.length > 0) {
              return self._redeployContainers(instances)
            }
          })

        Promise.all([cleanupContextVersionsPromise, removedActiveInstances]).asCallback(done)
      }
    )
}

/**
 * should redeploy all instances passed in
 * @param {Array} instances array of instances to start
 * @returns {Promise}
 * @private
 */
OnDockRemovedWorker.prototype._redeployContainers = function (instances) {
  var self = this
  return Promise.each(instances, function (instance) {
    var instanceModel = self.runnableClient.newInstance(instance.shortHash)
    return instanceModel.redeployAsync({
      qs: {
        rollingUpdate: true
      }
    })
  })
}

/**
 * Updated all the contextVersions to set the dockRemoved flag to true
 * @param {Array} contextVersions - array of context versions
 * @returns {Promise}
 * @private
 */
OnDockRemovedWorker.prototype._markContextVersionsDockRemove = function (contextVersions) {
  return null
}

/**
 * Filteres the list of context versions for stopping containers, which it then marks as stopped
 * @param {Array} contextVersions - array of context versions
 * @returns {Promise}
 * @private
 */
OnDockRemovedWorker.prototype._markStoppingContextVersionsAsStopped = function (contextVersions) {
  return null
}
