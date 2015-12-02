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


        var removedActiveInstances = Instance.findActiveInstancesByDockerHostAsync(dockerHost)
          .then(function (instances) {
            if (instances.length > 0) {
              return self._redeployContainers(instances)
            }
          })

        Promise.all([
            removedActiveInstances,
            ContextVersion.markDockRemovedByDockerHostAsync(dockerHost),
            Instance.setStoppingAsStoppedByDockerHostAsync(dockerHost)

            // Make sure that all the promises finish, don't short-circuit if one part fails
          ].map(function (promise) {

            return promise.reflect()
          })
        )
          .then(function (inspections) {
            // If an exception has occurred throw that as an error
            inspections.forEach(function (inspection) {
              if (!inspection.isFulfilled()) {
                throw inspection.reason()
              }
            })
          })
          .asCallback(done)
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
