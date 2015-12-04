/**
 * Handler `on-dock-removed` event from mavis
 *  - get all instance on teh dock
 *  - redeploy those instancee
 * @module lib/workers/on-dock-removed
 */
'use strict'

require('loadenv')()
var domain = require('domain')
var put = require('101/put')
var util = require('util')

var rabbitMQ = require('models/rabbitmq')
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
  Instance.findActiveInstancesByDockerHost(dockerHost, function (err, instances) {
    if (err) {
      log.error(put({
        err: err
      }, self.logData), 'OnDockRemovedWorker handle: findActiveInstancesByDockerHost err')
      return done()
    }
    // if array is empty we have no work to do
    if (instances.length <= 0) {
      log.trace(self.logData, 'OnDockRemovedWorker handle: no instances on unhealthy dock')
      return done()
    }
    self._redeployContainers(instances)
    log.trace(self.logData, 'OnDockRemovedWorker.prototype.handle final success')
    done()
  })
}

/**
 * should redeploy all instances passed in
 * @param {Array}    instances       array of instances to redeploy
 * @param {Function} cb              (err)
 */
OnDockRemovedWorker.prototype._redeployContainers = function (instances) {
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
