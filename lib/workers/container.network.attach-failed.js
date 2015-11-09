/**
 * Handle to `container.network.attach-failed` event from Sauron
 * Job created in Sauron
 * @module lib/workers/container.network.attach-failed
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
    }, 'container-network-attach-failed-worker domain error');
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
 * @param data.inspectData.Config.Labels.instanceId
 * @param data.id - docker container id
 * @param data.err - error from Sauron
 */
function ContainerNetworkAttachFailedWorker (data) {
  log.trace('ContainerNetworkAttachFailedWorker constructor');
  var inspectData = data.inspectData;
  var labels = keypather.get(inspectData, 'Config.Labels');
  this.instanceId = labels.instanceId;
  this.containerId = data.id;
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
  // we don't care about container that has no instanceId label
  if (!this.instanceId) {
    log.trace(this.logData,
      'ContainerNetworkAttachedWorker.prototype.handle exit because instanceId is null');
    return done();
  }
  var self = this;
  async.series([
    this._baseWorkerFindInstance.bind(this, {
      '_id': this.instanceId,
      'container.dockerContainer': this.containerId
    }),
    this._updateInstance.bind(this),
    this._updateFrontend.bind(this)
  ], function handleWorkerEnd (err) {
    if (err) {
      var newLogData = put({ err: err }, self.logData);
      log.error(newLogData, 'ContainerNetworkAttachFailedWorker.prototype.handle final error');
      error.workerErrorHandler(err, newLogData);
    }
    else {
      log.trace(self.logData, 'ContainerNetworkAttachFailedWorker.prototype.handle final success');
    }
    done();
  });
};

/**
 * Update frontend if we found instance
 * @param {Function} cb
 */
ContainerNetworkAttachFailedWorker.prototype._updateFrontend = function (cb) {
  if (this.instance) {
    var userGitHubId = keypather.get(this.instance, 'createdBy.github');
    this._baseWorkerUpdateInstanceFrontend(this.instance._id, userGitHubId, 'update', cb);
  } else {
    cb();
  }
};

/**
 * Update instance document with container error
 * @param {Function} cb
 */
ContainerNetworkAttachFailedWorker.prototype._updateInstance = function (cb) {
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
      }, self.logData), '_updateInstance: set container.error error');
    } else {
      log.trace(self.logData, '_updateInstance: set container.error final success');
    }
    return cb(err);
  });
};
