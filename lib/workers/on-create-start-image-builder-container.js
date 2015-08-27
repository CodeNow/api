/**
 * Manage starting a build container (and save it to the context version)
 * on a dock with retry attempts
 *
 * @module lib/workers/on-create-start-image-builder-container
 */
'use strict';

require('loadenv')();
var async = require('async');
var domain = require('domain');
var keypather = require('keypather')();
var pick = require('101/pick');
var put = require('101/put');
var util = require('util');

var BaseWorker = require('workers/base-worker');
var Docker = require('models/apis/docker');
var ContextVersion = require('models/mongo/context-version');
var Sauron = require('models/apis/sauron');
var error = require('error');
var log = require('middlewares/logger')(__filename).log;

module.exports = OnCreateStartImageBuilderContainerWorker;

module.exports.worker = function (data, done) {
  var workerDomain = domain.create();
  workerDomain.on('error', function (err) {
    error.workerErrorHandler(err, data);
    done();
  });
  workerDomain.run(function () {
    log.info(put({
      tx: true
    }, data), 'hermes.subscribe on-create-start-image-builder-container-worker start');
    var worker = new OnCreateStartImageBuilderContainerWorker(data);
    worker.handle(done);
  });
};

function OnCreateStartImageBuilderContainerWorker (data) {
  log.info('OnCreateStartImageBuilderContainerWorker constructor');
  var labels = keypather.get(data, 'inspectData.Config.Labels');
  this.contextVersionId = labels['contextVersion.id'];
  this.dockerContainer = data.inspectData;
  this.dockerContainerId = this.dockerContainer.Id;
  this.dockerHost = data.host;
  this.dockerTag = labels.dockerTag;
  this.hostIp = labels.hostIp;
  this.networkIp = labels.networkIp;
  this.sauronHost = labels.sauronHost;

  this.docker = new Docker(this.dockerHost);
  BaseWorker.apply(this, arguments);
}

util.inherits(OnCreateStartImageBuilderContainerWorker, BaseWorker);

/**
 * This should be attached to the Docker-Listen event for the creation of build containers
 * @param done
 */
OnCreateStartImageBuilderContainerWorker.prototype.handle = function (done) {
  var self = this;
  this.logData.contextVersionId = self.contextVersionId;
  this.logData.dockerContainerId = self.dockerContainerId;
  log.info(this.logData, 'OnCreateStartImageBuilderContainerWorker.prototype.handle');
  async.series([
    function (cb) {
      self._findContextVersion({
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
      }, cb);
    },
    this._startContainer.bind(this),
    this._updateContextVersion.bind(this),
    function (cb) {
      self._updateFrontendWithContextVersion('build_running', cb);
    }
  ], function (err) {
    if (err) {
      log.error(put({
        err: err
      }, self.logData), 'OnCreateStartImageBuilderContainerWorker.prototype.handle final error');
      if (self.contextVersion) {
        return self._onError(err, done);
      } else {
        done();
      }
    }
    else {
      log.info(
        self.logData,
        'OnCreateStartImageBuilderContainerWorker.prototype.handle final success'
      );
    }
    done();
  });
};

/**
 * Attempt to start container X times.
 *  - after failure or success, remove "starting" state in mongo
 * @param {Function} startContainerCb
 */
OnCreateStartImageBuilderContainerWorker.prototype._startContainer = function (startContainerCb) {
  log.info(this.logData, 'OnCreateStartImageBuilderContainerWorker.prototype._startContainer');
  var self = this;
  this.docker.startImageBuilderContainerWithRetry({
    times: process.env.WORKER_START_CONTAINER_NUMBER_RETRY_ATTEMPTS,
    interval: process.env.WORKER_DOCKER_RETRY_INTERVAL,
    ignoreStatusCode: 304
  }, this.dockerContainer, function (err) {
    if (err) {
      log.error(put({
        err: err,
      }, self.logData), 'OnCreateStartImageBuilderContainerWorker _startContainer final failure');
    }
    else {
      log.trace(self.logData,
        'OnCreateStartImageBuilderContainerWorker _startContainer final success');
    }
    startContainerCb(err);
  });
};

/**
 * update context version with the time the build container was started
 * @param {Function} updateCvCb
 */
OnCreateStartImageBuilderContainerWorker.prototype._updateContextVersion = function (updateCvCb) {
  log.info(this.logData, 'OnCreateStartImageBuilderContainerWorker.prototype._findContextVersion');
  var self = this;
  var update = {
    $set: {
      'build.containerStarted': new Date()
    }
  };
  ContextVersion.updateBy('build._id', self.contextVersion.build._id, update, { multi: true },
    function (err) {
      if (err) {
        log.error(put({
            err: err
          }, self.logData),
          'OnCreateStartImageBuilderContainerWorker _updateContextVersion updateBy error');
        return updateCvCb(err);
      }
      log.trace(
        self.logData,
        'OnCreateStartImageBuilderContainerWorker _updateContextVersion updateBy success'
      );
      updateCvCb();
    }
  );
};

/**
 * Deletes the host on Sauron for this build container, since we failed somewhere
 * Calls the updateFrontend method to update the cv and emit the event over the socket
 * @param error
 * @param onErrorCb
 * @private
 */
OnCreateStartImageBuilderContainerWorker.prototype._onError = function (error, onErrorCb) {
  var self = this;
  log.info(self.logData, 'OnCreateStartImageBuilderContainerWorker.prototype._onError');
  var sauron = new Sauron(this.sauronHost);
  sauron.deleteHost(self.networkIp, self.hostIp, function (err) {
    if (err) {
      log.error(put({
        err: err
      }, self.logData), 'OnCreateStartImageBuilderContainerWorker deleteSauronHost failed');
    } else {
      log.trace(put({
        contextVersion: pick(self.contextVersion, ['_id', 'name', 'owner']),
        container: pick(self.contextVersion.build, ['dockerContainer', 'dockerHost']),
        sauron: {
          networkIp: self.networkIp,
          hostIp: self.hostIp
        }
      }, self.logData), 'OnCreateStartImageBuilderContainerWorker deleteSauronHost success');
    }
    ContextVersion.updateBuildErrorByBuildId(self.contextVersion.build._id, error, function (err) {
      if (err) {
        log.error(
          put({
            err: err
          }, self.logData),
          'OnCreateStartImageBuilderContainerWorker updateBuildErrorByBuildId failed');
      }
      return onErrorCb(err);
    });
  });
};
