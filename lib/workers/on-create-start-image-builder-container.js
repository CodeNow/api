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
var uuid = require('node-uuid');

var Docker = require('models/apis/docker');
var ContextVersion = require('models/mongo/context-version');
var Sauron = require('models/apis/sauron');
var error = require('error');
var log = require('middlewares/logger')(__filename).log;

module.exports = OnCreateStartImageBuilderContainerWorker;

module.exports.worker = function (data, done) {
  var workerDomain = domain.create();
  workerDomain.on('error', function (err) {
    error.workerErrorHandler(err, done);
  });
  workerDomain.run(function () {
    log.info(put({
      tx: true
    }, data), 'hermes.subscribe on-create-start-image-builder-container-worker start');
    var worker = new OnCreateStartImageBuilderContainerWorker();
    worker.handle(data, done);
  });
};
function OnCreateStartImageBuilderContainerWorker () {
  this.logData = {
    tx: true,
    elapsedTimeSeconds: new Date(),
    uuid: uuid.v4()
  };
  log.info('OnCreateStartImageBuilderContainerWorker constructor');
}

/**
 * This should be attached to the Docker-Listen event for the creation of build containers
 * @param data
 * @param done
 */
OnCreateStartImageBuilderContainerWorker.prototype.handle = function (data, done) {
  var labels = keypather.get(data, 'inspectData.Config.Labels');
  this.dockerHost = data.host;
  this.docker = new Docker(this.dockerHost);
  this.sauron = new Sauron(labels.sauronHost);
  this.dockerTag = labels.dockerTag;
  this.networkIp = labels.networkIp;
  this.hostIp = labels.hostIp;
  this.contextVersionId = labels['contextVersion.id'];
  this.dockerContainer = data.inspectData;
  this.dockerContainerId = this.dockerContainer.Id;
  var self = this;
  this.logData = put({
    tx: true,
    contextVersionId: self.contextVersionId,
    elapsedTimeSeconds: new Date(),
    uuid: uuid.v4()
  }, data);
  // The logs get way too cluttered with these in here, so remove them
  //delete this.logData.inspectData.Config.Labels;
  async.series([
    this._findContextVersion.bind(this),
    this._updateContextVersionWithContainer.bind(this),
    this._startContainer.bind(this),
    this._updateContextVersion.bind(this)
  ], function (err) {
    if (err) {
      log.warn(put({
        err: err
      }, self.logData), 'OnCreateStartImageBuilderContainerWorker.prototype.handle final error');
      if (self.contextVersion) {
        return self._onError(err, done);
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
 * find context version
 * @param {Function} findCvCb
 */
OnCreateStartImageBuilderContainerWorker.prototype._findContextVersion = function (findCvCb) {
  log.info(this.logData, 'OnCreateStartImageBuilderContainerWorker.prototype._findContextVersion');
  var self = this;
  ContextVersion.findOne({
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
  }, function (err, result) {
    if (err) {
      log.warn(put({
          err: err
        }, self.logData),
        'OnCreateStartImageBuilderContainerWorker _findContextVersion findOne error'
      );
      return findCvCb(err);
    }
    else if (!result) {
      log.warn(
        self.logData,
        'OnCreateStartImageBuilderContainerWorker _findContextVersion not found'
      );
      return findCvCb(new Error('contextVersion not found'));
    }
    log.trace(put({
        contextVersion: pick(result, ['_id', 'name', 'owner'])
      }, self.logData),
      'OnCreateStartImageBuilderContainerWorker _findContextVersion findOne success'
    );
    self.contextVersion = result;
    findCvCb();
  });
};

/**
 * save the container details to the contextVersion
 * @param {Function} upCvCb
 */
OnCreateStartImageBuilderContainerWorker
      .prototype._updateContextVersionWithContainer = function (upCvCb) {
  log.info(this.logData, 'OnCreateStartImageBuilderContainerWorker.prototype._findContextVersion');
  var self = this;
  ContextVersion.updateContainerByBuildId({
    buildId: self.contextVersion.build._id,
    buildContainerId: self.dockerContainerId,
    tag: self.dockerTag,
    host: self.dockerHost,
    network: {
      networkIp: self.networkIp,
      hostIp: self.hostIp
    }
  }, function (err) {
    if (err) {
      log.warn(put({
          err: err
        }, self.logData),
        'OnCreateStartImageBuilderContainerWorker _updateContextVersionWithContainer error');
      return upCvCb(err);
    }
    log.trace(put({
        contextVersion: pick(self.contextVersion, ['_id', 'name', 'owner']),
        container: {
          dockerContainer: self.dockerContainerId,
          dockerHost: self.dockerHost
        }
      }, self.logData),
      'OnCreateStartImageBuilderContainerWorker_updateContextVersionWithContainer success');
    upCvCb();
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
  var attemptCount = 1;
  async.retry({
    times: process.env.WORKER_START_CONTAINER_NUMBER_RETRY_ATTEMPTS,
    interval: 200
  }, function (cb) {
    self.docker.startImageBuilderContainer(self.dockerContainer, function (err) {
      if (err) {
        log.warn(put({
            err: err,
            attemptCount: attemptCount
          }, self.logData),
          'OnCreateStartImageBuilderContainerWorker _startContainer attempt failure'
        );

        if (err.reason === 'container already started') {
          log.info(put({
              err: err,
              attemptCount: attemptCount
            }, self.logData),
            'OnCreateStartImageBuilderContainerWorker _startContainer: ' + err.reason
          );
          return cb(null);
        } else if (err.reason === 'container not found') {
          log.error(put({
              err: err,
              attemptCount: attemptCount
            }, self.logData),
            'OnCreateStartImageBuilderContainerWorker _startContainer: ' + err.reason
          );
          return cb(err);
        }

        attemptCount++;
      }
      else {
        log.trace(put({
          attemptCount: attemptCount
        }, self.logData), 'OnCreateStartImageBuilderContainerWorker _startContainer success');
      }
      cb.apply(this, arguments);
    });
  }, function (err) {
    if (err) {
      log.warn(put({
        err: err,
        attemptCount: attemptCount
      }, self.logData), 'OnCreateStartImageBuilderContainerWorker _startContainer final failure');
    }
    else {
      log.trace(put({
        attemptCount: attemptCount
      }, self.logData), 'OnCreateStartImageBuilderContainerWorker _startContainer final success');
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
    function (err, result) {
      if (err) {
        log.warn(put({
            err: err
          }, self.logData),
          'OnCreateStartImageBuilderContainerWorker _updateContextVersion updateBy error');
        return updateCvCb(err);
      }
      else if (!result) {
        log.warn(
          self.logData,
          'OnCreateStartImageBuilderContainerWorker _updateContextVersion not found'
        );
        return updateCvCb(new Error('contextVersion not found'));
      }
      log.trace(put({
          contextVersion: pick(result, ['_id', 'name', 'owner'])
        }, self.logData),
        'OnCreateStartImageBuilderContainerWorker _updateContextVersion updateBy success');
      updateCvCb();
  });
};

/**
 * Emit primus event to frontend notifying of failure
 */
OnCreateStartImageBuilderContainerWorker.prototype._updateFrontend = function (error, cb) {
  log.info(put({
    eventName: 'build_complete'
  }, this.logData), 'OnCreateStartImageBuilderContainerWorker.prototype._updateFrontend');
  var self = this;
  ContextVersion.updateBuildErrorByBuildId(self.contextVersion.build._id, error, function (err) {
    if (err) {
      log.warn(
        put({
          err: err
        }, self.logData),
        'OnCreateStartImageBuilderContainerWorker updateBuildErrorByBuildId failed');
    }
    return cb();
  });
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

  self.sauron.deleteHost(self.networkIp, self.hostIp, function (err) {
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
    return self._updateFrontend(error, onErrorCb);
  });
};