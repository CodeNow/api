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
var ContextVersion = require('models/mongo/context-version')
var error = require('error')
var log = require('middlewares/logger')(__filename).log
var rabbitMQ = require('models/rabbitmq')

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
    this._publishStartContainer.bind(this)
  ], function (err) {
    if (err) {
      log.error(put({
        err: err
      }, self.logData), 'OnImageBuilderContainerCreate.prototype.handle final error')
      if (self.contextVersion) {
        return self._onError(err, done)
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
 * @param {Function} cb
 */
OnImageBuilderContainerCreate.prototype._publishStartContainer = function (cb) {
  log.info(this.logData, 'OnImageBuilderContainerCreate.prototype._startContainer')

  rabbitMQ.containerImageBuilderStart({
    dockerContainerId: this.dockerContainerId,
    dockerHost: this.dockerHost,
    contextVersionId: this.contextVersionId
  })
  cb()
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
    // we don't want to callback with error
    // because onErrorCb is job done callback and we always try to acknowldge job
    return onErrorCb()
  })
}
