/**
 * Manage starting a build container (and save it to the context version)
 * on a dock with retry attempts
 *
 * @module lib/workers/on-image-builder-container-create
 */
'use strict'

require('loadenv')()
var async = require('async')
var domain = require('domain')
var keypather = require('keypather')()
var put = require('101/put')
var util = require('util')

var BaseWorker = require('workers/base-worker')
var Docker = require('models/apis/docker')
var ContextVersion = require('models/mongo/context-version')
var error = require('error')
var log = require('middlewares/logger')(__filename).log

module.exports = OnImageBuilderContainerCreate

module.exports.worker = function (data, done) {
  var workerDomain = domain.create()
  workerDomain.runnableData = BaseWorker.getRunnableData()
  workerDomain.on('error', function (err) {
    error.workerErrorHandler(err, data)
    done()
  })
  workerDomain.run(function () {
    log.info(put({
      tx: true
    }, data), 'hermes.subscribe on-image-builder-container-create start')
    var worker = new OnImageBuilderContainerCreate(data)
    worker.handle(done)
  })
}

function OnImageBuilderContainerCreate (data) {
  log.trace('OnImageBuilderContainerCreate constructor')
  var labels = keypather.get(data, 'inspectData.Config.Labels')
  this.contextVersionId = labels['contextVersion.id']
  this.dockerContainerId = data.inspectData.Id
  this.dockerHost = data.host
  this.dockerTag = labels.dockerTag
  this.docker = new Docker(this.dockerHost)
  BaseWorker.apply(this, arguments)
}

util.inherits(OnImageBuilderContainerCreate, BaseWorker)

/**
 * This should be attached to the Docker-Listen event for the creation of build containers
 * @param done
 */
OnImageBuilderContainerCreate.prototype.handle = function (done) {
  var self = this
  log.info(this.logData, 'OnImageBuilderContainerCreate.prototype.handle')
  async.series([
    function (cb) {
      self._baseWorkerFindContextVersion({
        '_id': self.contextVersionId,
        'build.containerStarted': {
          $exists: false
        },
        'build.started': {
          $exists: true
        },
        'build.finished': {
          $exists: false
        }
      }, cb)
    },
    this._startContainer.bind(this),
    this._updateContextVersion.bind(this),
    this._baseWorkerUpdateContextVersionFrontend.bind(this, 'build_running')
  ], function (err) {
    if (err) {
      log.error(put({
        err: err
      }, self.logData), 'OnImageBuilderContainerCreate.prototype.handle final error')
      if (self.contextVersion) {
        return self._onError(err, done)
      } else {
        done()
      }
    } else {
      log.trace(
        self.logData,
        'OnImageBuilderContainerCreate.prototype.handle final success'
      )
    }
    done()
  })
}

/**
 * Attempt to start container X times.
 *  - after failure or success, remove "starting" state in mongo
 * @param {Function} startContainerCb
 */
OnImageBuilderContainerCreate.prototype._startContainer = function (startContainerCb) {
  log.info(this.logData, 'OnImageBuilderContainerCreate.prototype._startContainer')
  var self = this
  this.docker.startImageBuilderContainerWithRetry(
    {
      times: process.env.WORKER_START_CONTAINER_NUMBER_RETRY_ATTEMPTS,
      ignoreStatusCode: 304
    },
    this.dockerContainerId,
    function (err) {
      if (err) {
        log.error(put({
          err: err
        }, self.logData), 'OnImageBuilderContainerCreate _startContainer final failure')
      } else {
        log.trace(self.logData, 'OnImageBuilderContainerCreate _startContainer final success')
      }
      startContainerCb(err)
    })
}

/**
 * update context version with the time the build container was started
 * @param {Function} updateCvCb
 */
OnImageBuilderContainerCreate.prototype._updateContextVersion = function (updateCvCb) {
  log.info(this.logData, 'OnImageBuilderContainerCreate.prototype._updateContextVersion')
  var self = this
  var update = {
    $set: {
      'build.containerStarted': new Date()
    }
  }
  ContextVersion.updateBy('build._id', self.contextVersion.build._id, update, { multi: true },
    function (err) {
      if (err) {
        log.error(put({
          err: err
        }, self.logData),
          '_updateContextVersion: updateBy error')
        return updateCvCb(err)
      }
      log.trace(
        self.logData,
        '_updateContextVersion: updateBy success'
      )
      updateCvCb()
    }
  )
}

/**
 * Calls the updateBuildErrorByBuildId method to update the cv and emit the event over the socket
 * @param error
 * @param onErrorCb
 * @private
 */
OnImageBuilderContainerCreate.prototype._onError = function (error, onErrorCb) {
  var self = this
  log.info(self.logData, 'OnImageBuilderContainerCreate.prototype._onError')
  ContextVersion.updateBuildErrorByBuildId(self.contextVersion.build._id, error, function (err) {
    if (err) {
      log.error(
        put({
          err: err
        }, self.logData),
        'OnImageBuilderContainerCreate updateBuildErrorByBuildId failed')
    }
    return onErrorCb(err)
  })
}
