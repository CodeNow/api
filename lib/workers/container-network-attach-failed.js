/**
 * Respond to container-network-attach-failed event from Sauron
 * Job created in Sauron
 * @module lib/workers/container-network-attach-failed
 */
'use strict';

require('loadenv')();
var async = require('async');
var domain = require('domain');
var keypather = require('keypather')();
var put = require('101/put');
var util = require('util');

var BaseWorker = require('workers/base-worker');
var Instance = require('models/mongo/instance');
var error = require('error');
var logger = require('middlewares/logger')(__filename);

var log = logger.log;

module.exports = ContainerNetworkAttachFailedWorker;

module.exports.worker = function (data, done) {
  log.trace({
    tx: true,
    dataId: data.id
  }, 'ContainerNetworkAttachFailedWorker module.exports.worker');
  var workerDomain = domain.create();
  workerDomain.runnableData = BaseWorker.getRunnableData();
  workerDomain.on('error', function (err) {
    log.fatal({
      tx: true,
      dataId: data.id,
      err: err
    }, 'on-instance-container-start-worker domain error');
    error.workerErrorHandler(err, data);
    // ack job and clear to prevent loop
    done();
  });
  workerDomain.run(function () {
    var worker = new ContainerNetworkAttachFailedWorker(data);
    worker.handle(done);
  });
};

/**
 * @param data.containerId - docker container id
 * @param data.err - error from Sauron
 */
function ContainerNetworkAttachFailedWorker (data) {
  log.trace('ContainerNetworkAttachFailedWorker constructor');
  this.containerId = data.containerId;
  this.networkErr = data.err;
  BaseWorker.apply(this, arguments);
}

util.inherits(ContainerNetworkAttachFailedWorker, BaseWorker);

/**
 * handles the work
 * @param done
 */
ContainerNetworkAttachFailedWorker.prototype.handle = function (done) {
  log.trace(this.logData, 'ContainerNetworkAttachFailedWorker.prototype.handle');
  var self = this;
  async.series([
    this._baseWorkerFindInstance.bind(this, {
      'container.dockerContainer': this.containerId
    }),
    this._updateInstance.bind(this)
  ], function (err) {
    if (err) {
      var newLogData = put({ err: err }, self.logData);
      log.error(newLogData, 'ContainerNetworkAttachFailedWorker.prototype.handle final error');
      error.workerErrorHandler(err, newLogData);
    }
    else {
      log.trace(self.logData, 'ContainerNetworkAttachFailedWorker.prototype.handle final success');
    }
    // maybe change to `network_attach_failed` in the future
    if (self.instance) {
      var userGitHubId = keypather.get(self.instance, 'createdBy.github');
      self._baseWorkerUpdateInstanceFrontend(
        self.instance._id, userGitHubId, 'update', done);
    }
  });
};

/**
 * Update instance document with container error
 * @param {Function} updateInstanceCb
 */
ContainerNetworkAttachFailedWorker.prototype._updateInstance = function (updateInstanceCb) {
  var self = this;
  log.trace(this.logData, 'ContainerNetworkAttachFailedWorker.prototype._updateInstance');
  var message = keypather.get(this.networkErr, 'output.payload.message');
  var data = keypather.get(this.networkErr, 'data');
  var stack = keypather.get(this.networkErr, 'data.err');
  var setData = {
    container: {
      error: {
        message: message,
        data: data,
        stack: stack
      }
    }
  };
  Instance.findByIdAndUpdate(this.instance._id, { $set: setData }, function (err) {
    if (err) {
      log.error(put({
        err: err
      }, self.logData), '_updateInstance: modifyContainerInspect error');
    } else {
      log.trace(self.logData, '_updateInstance: modifyContainerInspect final success');
    }
    return updateInstanceCb(err);
  });
};
