/**
 * Manage starting a container on a dock with retry attempts
 * @module lib/workers/start-instance-container
 */
'use strict'

require('loadenv')()
var async = require('async')
var domain = require('domain')
var put = require('101/put')
var util = require('util')

var BaseWorker = require('workers/base-worker')
var Docker = require('models/apis/docker')
var error = require('error')
var log = require('middlewares/logger')(__filename).log

module.exports = StartInstanceContainerWorker

module.exports.worker = function (data, done) {
  log.info({
    tx: true,
    data: data
  }, 'StartInstanceContainerWorker module.exports.worker')
  var workerDomain = domain.create()
  workerDomain.runnableData = BaseWorker.getRunnableData()
  workerDomain.on('error', function (err) {
    log.fatal({
      tx: true,
      data: data,
      err: err
    }, 'start-instance-container domain error')
    error.workerErrorHandler(err, data)
    // ack job and clear to prevent loop
    done()
  })
  workerDomain.run(function () {
    log.info(put({
      tx: true
    }, data), 'hermes.subscribe start-instance-container-worker start')
    var worker = new StartInstanceContainerWorker(data)
    worker.handle(done)
  })
}

function StartInstanceContainerWorker () {
  log.info('StartInstanceContainerWorker constructor')
  BaseWorker.apply(this, arguments)
}

util.inherits(StartInstanceContainerWorker, BaseWorker)

/**
 * @param {Object} data - event metadata
 *   .containerId
 *   .host
 * @param {Function} done - sends ACK signal to rabbitMQ
 *   to remove job fro queue
 */
StartInstanceContainerWorker.prototype.handle = function (done) {
  log.info(this.logData, 'StartInstanceContainerWorker.prototype.handle')

  this.docker = new Docker(this.data.dockerHost)
  var self = this

  async.series([
    this._baseWorkerFindInstance.bind(this, {
      '_id': this.data.instanceId,
      'container.dockerContainer': this.data.dockerContainer
    }),
    this._baseWorkerFindUser.bind(this, this.data.sessionUserGithubId),
    this._setInstanceStateStarting.bind(this),
    this._startContainer.bind(this)
  ], function (err) {
    log.info(self.logData, '_handle: async.series callback')
    self._finalSeriesHandler(err, done)
  })
}

/**
 * Handle async.series final callback
 */
StartInstanceContainerWorker.prototype._finalSeriesHandler = function (err, done) {
  log.info(this.logData, 'StartInstanceContainerWorker.prototype._finalSeriesHandler')
  if (err) {
    log.warn(put({err: err}, this.logData),
      '_finalSeriesHandler: final error')
    if (this.instance) {
      log.trace(put({err: err}, this.logData),
        '_finalSeriesHandler: final error - instance')
      return this._baseWorkerUpdateInstanceFrontend(
        this.data.instanceId, this.data.sessionUserGithubId, 'update', done)
    } else {
      log.trace(put({err: err}, this.logData),
        '_finalSeriesHandler: final error - !instance')
    }
  } else {
    log.info(this.logData, '_finalSeriesHandler: final success')
  }
  done()
}

/**
 * Set instance container document state to "starting" and notify frontend
 * @param {Function} setInstanceStateStartingCb
 */
StartInstanceContainerWorker.prototype
._setInstanceStateStarting = function (setInstanceStateStartingCb) {
  log.info(this.logData, 'StartInstanceContainerWorker.prototype._setInstanceStateStarting')
  var self = this
  this.instance.setContainerStateToStarting(function (err, _instance) {
    if (err) {
      var logErrData = put({err: err}, self.logData)
      log.error(logErrData, '_setInstanceStateStarting: ' +
        'instance.setContainerStateToStarting error')
      setInstanceStateStartingCb(err)
    } else if (!_instance) {
      log.warn(self.logData, '_setInstanceStateStarting ' +
        'instance.setContainerStateToStarting !instance ' +
        'possibly already started')
      setInstanceStateStartingCb()
    } else {
      log.trace(self.logData, '_setInstanceStateStarting: ' +
        'instance.setContainerStateToStarting success')
      self.instance = _instance
      self._baseWorkerUpdateInstanceFrontend(
        self.data.instanceId,
        self.data.sessionUserGithubId,
        'starting',
        setInstanceStateStartingCb)
    }
  })
}

/**
 * Attempt to start container X times.
 *  - after failure or success, remove "starting" state in mongo
 * @param {Function} startContainerCb
 */
StartInstanceContainerWorker.prototype._startContainer = function (startContainerCb) {
  log.info(this.logData, 'StartInstanceContainerWorker.prototype._startContainer')
  var self = this
  this.docker.startUserContainerWithRetry(
    {
      times: process.env.WORKER_START_CONTAINER_NUMBER_RETRY_ATTEMPTS,
      ignoreStatusCode: 304
    },
    this.data.dockerContainer,
    this.data.sessionUserGithubId,
    function (err) {
      if (err) {
        log.warn(put({
          err: err
        }, self.logData), 'startContainer final failure')
      } else {
        log.trace(self.logData, 'startContainer final success')
      }
      self.instance.removeStartingStoppingStates(function (err2) {
        if (err2) {
          log.warn(put({
            err: err2
          }, self.logData), 'startContainer final removeStartingStoppingStates failure')
        } else {
          log.trace(self.logData, 'startContainer final removeStartingStoppingStates success')
        }
        startContainerCb(err)
      })
    })
}
