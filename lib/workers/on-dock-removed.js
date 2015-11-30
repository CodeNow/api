/**
 * Handler `on-dock-removed` event from mavis
 *  - get running containers on dock
 *  - redeploy those containers
 * @module lib/workers/on-dock-removed
 */
'use strict'

require('loadenv')()
var async = require('async')
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
    self._redeployContainers(instances, function (err) {
      if (err) {
        var newLogData = put({ err: err }, self.logData)
        log.error(newLogData, 'OnDockRemovedWorker.prototype.handle final error')
        error.workerErrorHandler(err, newLogData)
      } else {
        log.trace(self.logData, 'OnDockRemovedWorker.prototype.handle final success')
      }
      done()
    })
  })
}

/**
 * should redeploy all instances passed in
 * @param {Array}    instances       array of instances to start
 * @param {Function} cb              (err)
 */
 // TODO: we need to filter only successfull build here
 // TODO code for each filteredInstance

 // TODO
   // - update instance cv
   // - remove instance container
   // - remove dockerHost

 // if build successfull -> create new cv(reset docker-host), remove old container(job) and create new one

 // if unsuccessful - trigger rebuild of cv
OnDockRemovedWorker.prototype._redeployContainers = function (instances, cb) {
  async.forEach(instances, function (instance, taskCb) {
    rabbitMQ.redeployInstanceContainer({
      instanceId: instance._id,
      sessionUserGithubId: process.env.HELLO_RUNNABLE_GITHUB_ID
    })
    taskCb()
  }, cb)
}
