/**
 * Respond to container-start event from Docker
 * Job created from docker-listener running on a dock
 *  - update inspect data on instance
 * @module lib/workers/on-instance-container-create
 */
'use strict'

require('loadenv')()
var async = require('async')
var domain = require('domain')
var keypather = require('keypather')()
var put = require('101/put')
var util = require('util')

var BaseWorker = require('workers/base-worker')
var Hosts = require('models/redis/hosts')
var InstanceService = require('models/services/instance-service')
var error = require('error')
var logger = require('middlewares/logger')(__filename)

var log = logger.log

module.exports = OnInstanceContainerStartWorker

module.exports.worker = function (data, done) {
  log.trace({
    tx: true,
    dataId: data.id
  }, 'OnInstanceContainerStartWorker module.exports.worker')
  var workerDomain = domain.create()
  workerDomain.runnableData = BaseWorker.getRunnableData()
  workerDomain.on('error', function (err) {
    log.fatal({
      tx: true,
      dataId: data.id,
      err: err
    }, 'on-instance-container-start-worker domain error')
    error.workerErrorHandler(err, data)
    // ack job and clear to prevent loop
    done()
  })
  workerDomain.run(function () {
    var worker = new OnInstanceContainerStartWorker(data)
    worker.handle(done)
  })
}

/**
 * This worker should occur from the DockerListener event for a container starting.  The data
 * is what DockerListener was given
 *
 * @param data
 *    - .inspectData
 *        .labels.instanceId
 * @constructor
 */
function OnInstanceContainerStartWorker (data) {
  log.trace('OnInstanceContainerStartWorker constructor')
  var labels = keypather.get(data, 'inspectData.Config.Labels')
  this.container = data
  this.container.ports = data.inspectData.NetworkSettings.Ports
  this.dockerContainerId = data.id
  this.inspectData = data.inspectData
  this.instanceId = labels.instanceId
  this.ownerUsername = labels.ownerUsername
  this.sessionUserGithubId = labels.sessionUserGithubId
  BaseWorker.apply(this, arguments)
}

util.inherits(OnInstanceContainerStartWorker, BaseWorker)

/**
 * handles the work
 * @param done
 */
OnInstanceContainerStartWorker.prototype.handle = function (done) {
  log.trace(this.logData, 'OnInstanceContainerStartWorker.prototype.handle')
  var self = this
  var hosts = new Hosts()
  async.series([
    this._baseWorkerFindInstance.bind(this, {
      '_id': this.instanceId,
      'container.dockerContainer': this.dockerContainerId
    }),
    function (cb) {
      hosts.upsertHostsForInstance(
        self.ownerUsername,
        self.instance,
        self.instance.name,
        self.container,
        cb)
    },
    this._updateInstance.bind(this)
  ], function (err) {
    if (err) {
      log.error(put({
        err: err
      }, self.logData), 'OnInstanceContainerStartWorker.prototype.handle final error')
    } else {
      log.trace(self.logData, 'OnInstanceContainerStartWorker.prototype.handle final success')
    }
    self._baseWorkerUpdateInstanceFrontend(
      self.instanceId, self.sessionUserGithubId, 'start', done)
  })
}

/**
 * Update instance document with container inspect
 * @param {Function} updateInstanceCb
 */
OnInstanceContainerStartWorker.prototype._updateInstance = function (updateInstanceCb) {
  var self = this
  log.trace(this.logData, 'OnInstanceContainerStartWorker.prototype._updateInstance')
  InstanceService.modifyExistingContainerInspect(
    this.instance,
    self.dockerContainerId,
    this.inspectData,
    function (err, instance) {
      if (err) {
        log.error(put({
          err: err
        }, self.logData), '_updateInstance: modifyContainerInspect error')
        return updateInstanceCb(err)
      }
      if (!instance) {
        log.error(self.logData, '_updateInstance: modifyContainerInspect instance not found')
        return updateInstanceCb(err)
      }
      log.trace(self.logData, '_updateInstance: modifyContainerInspect final success')
      return updateInstanceCb()
    })
}
