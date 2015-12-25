/**
 * @module lib/workers/on-instance-container-die
 */
'use strict'

require('loadenv')()
var async = require('async')
var domain = require('domain')
var error = require('error')
var keypather = require('keypather')()
var put = require('101/put')
var util = require('util')
var uuid = require('uuid')

var BaseWorker = require('workers/base-worker')
var InstanceService = require('models/services/instance-service')
var log = require('middlewares/logger')(__filename).log

module.exports = OnInstanceContainerDie

module.exports.worker = function (data, done) {
  var logData = put({
    tx: true,
    elapsedTimeSeconds: new Date(),
    uuid: uuid.v4(),
    data: data
  }, data)
  log.info(logData, 'OnInstanceContainerDie module.exports.worker')
  var workerDomain = domain.create()
  workerDomain.runnableData = BaseWorker.getRunnableData()
  workerDomain.on('error', function (err) {
    log.fatal(put({
      err: err
    }, logData), 'on-instance-container-die domain error')
    error.workerErrorHandler(err, data)
    // ack job and clear to prevent loop
    done()
  })
  workerDomain.run(function () {
    log.info(put({
      tx: true
    }, logData), 'hermes.subscribe on-instance-container-die start')
    var worker = new OnInstanceContainerDie(data)
    worker.handle(done)
  })
}

function OnInstanceContainerDie (data) {
  log.info('OnInstanceContainerDie constructor')
  this.containerId = data.id
  var inspectData = data.inspectData
  this.inspectData = inspectData
  var labels = keypather.get(inspectData, 'Config.Labels')
  this.instanceId = labels.instanceId
  this.sessionUserGithubId = labels.sessionUserGithubId
  BaseWorker.apply(this, arguments)
}

util.inherits(OnInstanceContainerDie, BaseWorker)

/**
 * handles the work
 * @param done
 */
OnInstanceContainerDie.prototype.handle = function (done) {
  log.trace(this.logData, 'OnInstanceContainerDie.prototype.handle')
  // we don't care about container that has no instanceId label
  // E.x. temporary build containers have no labels. We don't care about them
  if (!this.instanceId) {
    log.info(this.logData, 'handle exit because instanceId is null')
    return done()
  }
  var self = this
  async.series([
    this._baseWorkerFindInstance.bind(this, {
      '_id': this.instanceId,
      'container.dockerContainer': this.containerId
    }),
    this._updateInstance.bind(this),
    this._updateFrontend.bind(this)
  ], function handleWorkerEnd (err) {
    if (err) {
      var newLogData = put({ err: err }, self.logData)
      log.error(newLogData, 'handle final error')
      error.workerErrorHandler(err, newLogData)
    } else {
      log.trace(self.logData, 'handle final success')
    }
    done()
  })
}

/**
 * Update frontend if we found instance
 * @param {Function} cb
 */
OnInstanceContainerDie.prototype._updateFrontend = function (cb) {
  log.info(this.logData, 'OnInstanceContainerDie.prototype._updateFrontend')
  if (this.instance) {
    log.info(this.logData, '_updateFrontend do update')
    this._baseWorkerUpdateInstanceFrontend(
      this.instanceId, this.sessionUserGithubId, 'update', cb)
  } else {
    log.info(this.logData, '_updateFrontend noop')
    cb()
  }
}
/**
 * Update instance document with docker inspect data
 * @param {Function} updateInstanceCb
 */
OnInstanceContainerDie.prototype._updateInstance = function (cb) {
  var self = this
  log.info(this.logData, 'OnInstanceContainerDie.prototype._updateInstance')
  InstanceService.modifyExistingContainerInspect(
    this.instance,
    this.containerId,
    this.inspectData,
    function (err) {
      if (err) {
        log.error(put({
          err: err
        }, self.logData), '_updateInstance: updateOnContainerDie error')
      } else {
        log.trace(self.logData, '_updateInstance: updateOnContainerDie final success')
      }
      return cb(err)
    })
}
