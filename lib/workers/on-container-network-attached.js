/**
 * Respond to container-network-attached event from Sauron
 * Job created in Sauron
 * @module lib/workers/on-container-network-attached
 */
'use strict';

require('loadenv')();
var async = require('async');
var domain = require('domain');
var put = require('101/put');
var util = require('util');

var BaseWorker = require('workers/base-worker');
var error = require('error');
var logger = require('middlewares/logger')(__filename);

var log = logger.log;

module.exports = OnContainerNetworkAttachedWorker;

module.exports.worker = function (data, done) {
  log.trace({
    tx: true,
    dataId: data.id
  }, 'OnContainerNetworkAttachedWorker module.exports.worker');
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
    var worker = new OnContainerNetworkAttachedWorker(data);
    worker.handle(done);
  });
};

/**
 * @param data.containerId  - docker container id
 * @param data.containerIp  - docker container IP
 */
function OnContainerNetworkAttachedWorker (data) {
  log.trace('OnContainerNetworkAttachedWorker constructor');
  this.containerId = data.containerId;
  this.containerIp = data.containerIp;
  BaseWorker.apply(this, arguments);
}

util.inherits(OnContainerNetworkAttachedWorker, BaseWorker);

/**
 * handles the work
 * @param done
 */
OnContainerNetworkAttachedWorker.prototype.handle = function (done) {
  log.trace(this.logData, 'OnContainerNetworkAttachedWorker.prototype.handle');
  var self = this;
  async.series([
    this._baseWorkerFindInstance.bind(this, {
      'container.dockerContainer': this.containerId
    }),
    this._updateInstance.bind(this)
  ], function (err) {
    if (err) {
      log.error(put({
        err: err
      }, self.logData), 'OnContainerNetworkAttachedWorker.prototype.handle final error');
    }
    else {
      log.trace(self.logData, 'OnContainerNetworkAttachedWorker.prototype.handle final success');
    }
    self._baseWorkerUpdateInstanceFrontend(
      self.instanceId, self.sessionUserGithubId, 'start', done);
  });
};

/**
 * Update instance document with container inspect
 * @param {Function} updateInstanceCb
 */
OnContainerNetworkAttachedWorker.prototype._updateInstance = function (updateInstanceCb) {
  var self = this;
  log.trace(this.logData, 'OnContainerNetworkAttachedWorker.prototype._updateInstance');
  this.instance.modifyContainerInspect(
    self.dockerContainerId,
    this.inspectData,
    function (err, instance) {
      if (err) {
        log.error(put({
          err: err
        }, self.logData), '_updateInstance: modifyContainerInspect error');
        return updateInstanceCb(err);
      }
      if (!instance) {
        log.error(self.logData, '_updateInstance: modifyContainerInspect instance not found');
        return updateInstanceCb(err);
      }
      log.trace(self.logData, '_updateInstance: modifyContainerInspect final success');
      return updateInstanceCb();
    });
};
