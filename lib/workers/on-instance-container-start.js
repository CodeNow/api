/**
 * Respond to container-start event from Docker
 * Job created from docker-listener running on a dock
 *  - update inspect data on instance
 * @module lib/workers/on-instance-container-create
 */
'use strict';

require('loadenv')();
var async = require('async');
var domain = require('domain');
var put = require('101/put');
var util = require('util');
var keypather = require('keypather')();

var BaseWorker = require('workers/base-worker');
var error = require('error');
var Hosts = require('models/redis/hosts');
var logger = require('middlewares/logger')(__filename);
var Sauron = require('models/apis/sauron');

var log = logger.log;

module.exports = OnInstanceContainerStartWorker;

module.exports.worker = function (data, done) {
  log.trace({
    tx: true,
    dataId: data.id
  }, 'OnInstanceContainerStartWorker module.exports.worker');
  var workerDomain = domain.create();
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
    var worker = new OnInstanceContainerStartWorker(data);
    worker.handle(done);
  });
};

/**
 * This worker should occur from the DockerListener event for a container starting.  The data
 * is what DockerListener was given
 *
 * @param data
 *    - .inspectData
 *        .labels.instanceId
 * @constructor
 */
function OnInstanceContainerStartWorker (data) {
  log.trace('OnInstanceContainerStartWorker constructor');
  var labels = keypather.get(data, 'inspectData.Config.Labels');
  this.container = data;
  this.container.ports = data.inspectData.NetworkSettings.Ports;
  this.dockerContainerId = data.id;
  this.inspectData = data.inspectData;
  this.instanceId = labels.instanceId;
  this.sauronHost = data.host;
  this.ownerUsername = labels.ownerUsername;
  this.sessionUserGithubId = labels.sessionUserGithubId;
  BaseWorker.apply(this, data, [{
    instanceId: this.instanceId,
    dockerContainerId: this.dockerContainerId,
    tid: data.tid
  }]);
}

util.inherits(OnInstanceContainerStartWorker, BaseWorker);

/**
 * handles the work
 * @param done
 */
OnInstanceContainerStartWorker.prototype.handle = function (done) {
  log.trace(this.logData, 'OnInstanceContainerStartWorker.prototype.handle');
  var self = this;

  async.series([
    function (cb) {
      self._findInstance({
        '_id': self.instanceId
      }, function (err, instance) {
        if (err) {
          return cb(err);
        }
        self.hostIp = instance.network.hostIp;
        self.networkIp = instance.network.networkIp;
        cb();
      });
    },
    this._attachContainerToNetwork.bind(this),
    this._updateInstance.bind(this)
  ], function (err) {
    if (err) {
      log.error(put({
        err: err
      }, self.logData), 'OnInstanceContainerStartWorker.prototype.handle final error');
    }
    else {
      log.trace(self.logData, 'OnInstanceContainerStartWorker.prototype.handle final success');
    }
    self._findUser(self.sessionUserGithubId, function (userError) {
      if (userError) {
        log.error(put({
          sessionUserGithubId: self.sessionUserGithubId,
          err: err
        }, self.logData), 'OnInstanceContainerStartWorker:' +
          'Failed to update the frontend to the container start event ' +
          'because we couldn\'t find the user');
      } else {
        return self._updateInstanceFrontend('start', done);
      }
      done();
    });
  });
};


/**
 * Attach host to container and upsert into weave
 * @param {Function} cb
 */
OnInstanceContainerStartWorker.prototype._attachContainerToNetwork = function (cb) {
  log.trace(this.logData, 'OnInstanceContainerStartWorker.prototype._attachContainerToNetwork');
  var sauron = new Sauron(this.sauronHost);
  var hosts = new Hosts();
  var self = this;
  async.series([
    sauron.attachHostToContainer.bind(sauron, self.networkIp, self.hostIp, self.dockerContainerId),
    hosts.upsertHostsForInstance.bind(
      hosts,
      self.ownerUsername,
      self.instance,
      self.instance.name,
      self.container
    )
  ], function (err) {
    if (err) {
      log.warn(
        put({
          err: err
        }, self.logData),
        'OnInstanceContainerStartWorker attachContainerToNetwork async.series error'
      );
    }
    else {
      log.trace(
        self.logData,
        'OnInstanceContainerStartWorker attachContainerToNetwork async.series success'
      );
    }
    cb(err);
  });
};


/**
 * Update instance document with container inspect
 * @param {Function} updateInstanceCb
 */
OnInstanceContainerStartWorker.prototype._updateInstance = function (updateInstanceCb) {
  var self = this;
  log.trace(this.logData, 'OnInstanceContainerStartWorker.prototype._updateInstance');

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
