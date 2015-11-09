/**
 * Respond to container.network.attached event from Sauron
 * Job created in Sauron after container was created and network was attached.
 * If network failed to attach then `container.network.attach-failed` would be called.
 * This worker replaces former `on-instance-container-start` worker because now
 * container "considered" started only after network was attached.
 * @module lib/workers/container.network.attached
 */
'use strict';

require('loadenv')();
var async = require('async');
var domain = require('domain');
var keypather = require('keypather')();
var put = require('101/put');
var util = require('util');

var Hosts = require('models/redis/hosts');

var BaseWorker = require('workers/base-worker');
var InstanceService = require('models/services/instance-service');
var error = require('error');
var logger = require('middlewares/logger')(__filename);

var log = logger.log;

module.exports = ContainerNetworkAttachedWorker;

module.exports.worker = function (data, done) {
  log.trace({
    tx: true,
    dataId: data.id
  }, 'ContainerNetworkAttachedWorker module.exports.worker');
  var workerDomain = domain.create();
  workerDomain.runnableData = BaseWorker.getRunnableData();
  workerDomain.on('error', function (err) {
    log.fatal({
      tx: true,
      dataId: data.id,
      err: err
    }, 'container-network-attached-worker domain error');
    error.workerErrorHandler(err, data);
    // ack job and clear to prevent loop
    done();
  });
  workerDomain.run(function () {
    var worker = new ContainerNetworkAttachedWorker(data);
    worker.handle(done);
  });
};

/**
 * @param data.inspectData.Config.Labels.instanceId
 * @param data.inspectData.Config.Labels.ownerUsername
 * @param data.inspectData.Config.Labels.sessionUserGithubId
 * @param data.id - docker container id
 * @param data.containerIp - docker container IP
 */
function ContainerNetworkAttachedWorker (data) {
  log.trace('ContainerNetworkAttachedWorker constructor');
  this.containerId = data.id;
  this.containerIp = data.containerIp;
  var inspectData = data.inspectData;
  var labels = keypather.get(inspectData, 'Config.Labels');
  this.container = data;
  this.container.ports = data.inspectData.NetworkSettings.Ports;
  this.inspectData = inspectData;
  this.instanceId = labels.instanceId;
  this.ownerUsername = labels.ownerUsername;
  this.sessionUserGithubId = labels.sessionUserGithubId;
  BaseWorker.apply(this, arguments);
}

util.inherits(ContainerNetworkAttachedWorker, BaseWorker);

/**
 * handles the work
 * @param done
 */
ContainerNetworkAttachedWorker.prototype.handle = function (done) {
  log.trace(this.logData, 'ContainerNetworkAttachedWorker.prototype.handle');
  // we don't care about container that has no instanceId label
  if (this.instanceId) {
    log.trace(this.logData,
      'ContainerNetworkAttachedWorker.prototype.handle exit because instanceId is null');
    return done();
  }
  var self = this;
  var hosts = new Hosts();
  async.series([
    this._baseWorkerFindInstance.bind(this, {
      '_id': this.instanceId,
      'container.dockerContainer': this.containerId
    }),
    function (cb) {
      hosts.upsertHostsForInstance(
        self.ownerUsername,
        self.instance,
        self.instance.name,
        self.container,
        cb);
    },
    this._updateInstance.bind(this),
    this._updateFrontend.bind(this)
  ], function handleWorkerEnd (err) {
    if (err) {
      var newLogData = put({ err: err }, self.logData);
      log.error(newLogData, 'ContainerNetworkAttachedWorker.prototype.handle final error');
      error.workerErrorHandler(err, newLogData);
    }
    else {
      log.trace(self.logData, 'ContainerNetworkAttachedWorker.prototype.handle final success');
    }
    done();
  });
};

/**
* Update frontend if we found instance
 * @param {Function} cb
 */
ContainerNetworkAttachedWorker.prototype._updateFrontend = function (cb) {
  if (this.instance) {
    this._baseWorkerUpdateInstanceFrontend(
      this.instanceId, this.sessionUserGithubId, 'start', cb);
  } else {
    cb();
  }
};
/**
 * Update instance document with container IP and docker inspect data
 * @param {Function} updateInstanceCb
 */
ContainerNetworkAttachedWorker.prototype._updateInstance = function (cb) {
  var self = this;
  log.trace(this.logData, 'ContainerNetworkAttachedWorker.prototype._updateInstance');
  var instanceService = new InstanceService();
  instanceService.updateOnContainerStart(
    this.instance,
    this.containerId,
    this.containerIp,
    this.inspectData,
    function (err) {
      if (err) {
        log.error(put({
          err: err
        }, self.logData), '_updateInstance: updateOnContainerStart error');
      } else {
        log.trace(self.logData, '_updateInstance: updateOnContainerStart final success');
      }
      return cb(err);
    });
};
