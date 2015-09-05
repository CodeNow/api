/**
 * Manage stopping a container on a dock with retry attempts
 * @module lib/workers/stop-instance-container
 */
'use strict';

require('loadenv')();
var async = require('async');
var domain = require('domain');
var put = require('101/put');
var util = require('util');

var BaseWorker = require('workers/base-worker');
var Docker = require('models/apis/docker');
var Sauron = require('models/apis/sauron');
var error = require('error');
var log = require('middlewares/logger')(__filename).log;

module.exports = StopInstanceContainerWorker;

module.exports.worker = function (data, done) {
  log.info({
    tx: true,
    data: data
  }, 'StopInstanceContainerWorker module.exports.worker');
  var workerDomain = domain.create();
  workerDomain.on('error', function (err) {
    log.fatal({
      tx: true,
      data: data,
      err: err
    }, 'stop-instance-container domain error');
    error.workerErrorHandler(err, data);
    // ack job and clear to prevent loop
    done();
  });
  workerDomain.run(function () {
    log.info(put({
      tx: true
    }, data), 'hermes.subscribe stop-instance-container-worker start');
    var worker = new StopInstanceContainerWorker(data);
    worker.handle(done);
  });
};

function StopInstanceContainerWorker () {
  log.info('StopInstanceContainerWorker constructor');
  BaseWorker.apply(this, arguments);
}

util.inherits(StopInstanceContainerWorker, BaseWorker);

/**
 * @param {Function} done - sends ACK signal to rabbitMQ
 *   to remove job fro queue
 */
StopInstanceContainerWorker.prototype.handle = function (done) {
  log.info(this.logData, 'StopInstanceContainerWorker.prototype.handle');
  this.docker = new Docker(this.data.dockerHost);
  var self = this;
  async.series([
    this._baseWorkerFindInstance.bind(this),
    this._baseWorkerFindUser.bind(this),
    this._setInstanceStateStopping.bind(this),
    this._stopContainer.bind(this),
    this._baseWorkerInspectContainerAndUpdate.bind(this),
    this._detachContainerFromNetwork.bind(this)
  ], function (err) {
    log.info(self.logData, '_handle: async.series callback');
    self._finalSeriesHandler(err, done);
  });
};

/**
 * Handle async.series final callback
 */
StopInstanceContainerWorker.prototype._finalSeriesHandler = function (err, done) {
  log.info(this.logData, 'StopInstanceContainerWorker.prototype._finalSeriesHandler');
  var self = this;
  if (err) {
    log.warn(put({err: err}, self.logData),
      '_finalSeriesHandler: final error');
    if (self.instance) {
      log.trace(put({err: err}, self.logData),
        '_finalSeriesHandler: final error - instance');
      /**
       * Inspect & update in case mongo state is running = false
       * but container is running and _stopContainer failed due to
       * container is already running error
       */
      self._baseWorkerInspectContainerAndUpdate(function (err2) {
        if (err2) {
          log.warn(
            put({err: err, err2: err2}, self.logData),
            '_finalSeriesHandler: final error '+
            '- instance - self._baseWorkerInspectContainerAndUpdate error');
        }
        else {
          log.info(
            put({err: err}, self.logData),
            '_finalSeriesHandler: final error '+
            '- instance - self._baseWorkerInspectContainerAndUpdate success');
        }
        self._baseWorkerUpdateInstanceFrontend('update');
      });
    }
    else {
      log.trace(put({err: err}, self.logData),
        '_finalSeriesHandler: final error - !instance');
    }
  }
  else {
    log.info(self.logData, '_finalSeriesHandler: final success');
    self._baseWorkerUpdateInstanceFrontend('stop');
  }
  done();
};

/**
 * Set instance container document state to "starting" and notify frontend
 * @param {Function} setInstanceStateStoppingCb
 */
StopInstanceContainerWorker.prototype
._setInstanceStateStopping = function (setInstanceStateStoppingCb) {
  log.info(this.logData, 'StopInstanceContainerWorker.prototype._setInstanceStateStopping');
  var self = this;
  this.instance.setContainerStateToStopping(function (err, _instance) {
    if (err) {
      var logErrData = put({err: err}, self.logData);
      log.error(logErrData, '_setInstanceStateStopping: '+
                'instance.setContainerStateToStarting error');
      return setInstanceStateStoppingCb(err);
    }
    else if (!_instance){
      log.warn(self.logData, '_setInstanceStateStopping '+
              'instance.setContainerStateToStarting !instance '+
              'possibly already started');
    }
    else {
      log.trace(self.logData, '_setInstanceStateStopping: '+
                'instance.setContainerStateToStarting success');
      self.instance = _instance;
      self._baseWorkerUpdateInstanceFrontend('stopping');
    }
    setInstanceStateStoppingCb();
  });
};

/**
 * Attempt to start container X times.
 *  - after failure or success, remove "starting" state in mongo
 * @param {Function} stopContainerCb
 */
StopInstanceContainerWorker.prototype._stopContainer = function (stopContainerCb) {
  log.info(this.logData, 'StopInstanceContainerWorker.prototype._stopContainer');
  var self = this;
  var attemptCount = 0;
  async.retry({
    times: process.env.WORKER_STOP_CONTAINER_NUMBER_RETRY_ATTEMPTS
  }, function (cb) {
    // args: containerId, force
    self.docker.stopContainer(self.data.dockerContainer, function (err) {
      attemptCount++;
      if (err) {
        log.warn(put({
          err: err,
          attemptCount: attemptCount
        }, self.logData), 'stopContainer attempt failure');
      }
      else {
        log.trace(put({
          attemptCount: attemptCount
        }, self.logData), 'stopContainer success');
      }
      cb.apply(this, arguments);
    });
  }, function (err) {
    if (err) {
      log.warn(put({
        err: err,
        attemptCount: attemptCount
      }, self.logData), 'stopContainer final failure');
    }
    else {
      log.trace(put({
        attemptCount: attemptCount
      }, self.logData), 'stopContainer final success');
    }
    self.instance.removeStartingStoppingStates(function (err2) {
      if (err2) {
        log.warn(put({
          err: err2,
          attemptCount: attemptCount
        }, self.logData), 'stopContainer final removeStartingStoppingStates failure');
      }
      else {
        log.trace(self.logData, 'stopContainer final removeStartingStoppingStates success');
      }
      stopContainerCb(err);
    });
  });
};

/**
 * Attach host to container and upsert into weave
 * @param {Function} detachContainerFromNetworkCb
 */
StopInstanceContainerWorker.prototype
._detachContainerFromNetwork = function (detachContainerFromNetworkCb) {
    log.info(this.logData, 'StopInstanceContainerWorker.prototype._detachContainerFromNetwork');
  var sauron = new Sauron(this.data.dockerHost);
  var data = this.data;
  var self = this;
  sauron.detachHostFromContainer(data.networkIp, data.hostIp, data.dockerContainer, function (err) {
    if (err) {
      log.warn(put({
        err: err
      }, self.logData), 'detachContainerFromNetwork async.series error');
    }
    else {
      log.trace(self.logData, 'detachContainerFromNetwork async.series success');
    }
    detachContainerFromNetworkCb(err);
  });
};
