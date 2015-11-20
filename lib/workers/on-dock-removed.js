/**
 * Handler `on-dock-removed` event from mavis
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

var BaseWorker = require('workers/base-worker')
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
        Instance.findActiveInstancesByDockerHost(dockerHost, function (err2, instances) {
          if (err2) {
            log.error(put({
              err: err2
            }, self.logData), 'OnDockRemovedWorker handle: findActiveInstancesByDockerHost err')
            return done()
          }
          // if array is empty we have no work to do
          if (instances.length <= 0) {
            log.trace(self.logData, 'OnDockRemovedWorker handle: no instances on unhealthy dock')
            return done()
          }
          self._redeployContainers(instances, done)
        })
      })
}

/**
 * should redeploy all instances passed in
 * @param {Array}    instances       array of instances to start
 * @param {Function} cb              (err)
 */
OnDockRemovedWorker.prototype._redeployContainers = function (instances, cb) {
  var self = this
  async.forEach(instances, function (instance, _cb) {
    var logData = {
      tx: true,
      instanceId: instance._id
    }
    log.info(logData, 'OnDockRemovedWorker _redeployContainers')
    var instanceModel = self.runnableClient.newInstance(instance.shortHash)
    instanceModel.redeploy({
      qs: {
        rollingUpdate: true
      }
    }, function (err) {
      // ignore errors for now
      if (err) {
        log.error(put({
          err: err
        }, logData), 'OnDockRemovedWorker _redeployContainers redeploy err')
      }
      _cb()
    })
  }, cb)
}
