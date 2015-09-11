/**
 * Respond to container-create event from Docker
 * Job created from docker-listener running on a dock
 *  - update instance model
 *  - create start-instance-container job
 * @module lib/workers/on-instance-container-create
 */
'use strict';

require('loadenv')();
var async = require('async');
var domain = require('domain');
var put = require('101/put');
var util = require('util');

var BaseWorker = require('workers/base-worker');
var Instance = require('models/mongo/instance');
var error = require('error');
var log = require('middlewares/logger')(__filename).log;
var rabbitMQ = require('models/rabbitmq');

module.exports = OnInstanceContainerCreateWorker;

module.exports.worker = function (data, done) {
  log.info({
    tx: true,
    data: data
  }, 'OnInstanceContainerCreateWorker module.exports.worker');
  var workerDomain = domain.create();
  workerDomain.on('error', function (err) {
    log.fatal({
      tx: true,
      data: data,
      err: err
    }, 'on-instance-container-create-worker domain error');
    error.workerErrorHandler(err, data);
    // ack job and clear to prevent loop
    done();
  });
  workerDomain.run(function () {
    log.info(put({
      tx: true
    }, data), 'hermes.subscribe on-instance-container-create-worker start');
    var worker = new OnInstanceContainerCreateWorker(data);
    worker.handle(done);
  });
};

function OnInstanceContainerCreateWorker () {
  log.info('OnInstanceContainerCreateWorker constructor');
  BaseWorker.apply(this, arguments);
}

util.inherits(OnInstanceContainerCreateWorker, BaseWorker);

/**
 * @param {Object} data - event metadata
 *   .containerId
 *   .host
 * @param {Function} done - sends ACK signal to rabbitMQ
 *   to remove job fro queue
 */
OnInstanceContainerCreateWorker.prototype.handle = function (done) {
  log.info(this.logData, 'OnInstanceContainerCreateWorker.prototype.handle');
  this.instance = null;
  var self = this;
  async.series([
    this._updateInstance.bind(this),
    this._startContainer.bind(this)
  ], function (err) {
    if (err) {
      log.warn(put({
        err: err
      }, self.logData), 'OnInstanceContainerCreateWorker.prototype.handle final error');
    }
    else {
      log.info(self.logData, 'OnInstanceContainerCreateWorker.prototype.handle final success');
    }
    done();
  });
};

/**
 * Update instance document with container inspect
 * @param {Function} updateInstanceCb
 */
OnInstanceContainerCreateWorker.prototype._updateInstance = function (updateInstanceCb) {
  log.info(this.logData, 'OnInstanceContainerCreateWorker.prototype._updateInstance');
  var instanceId = this.data.inspectData.Config.Labels.instanceId;
  var contextVersionId = this.data.inspectData.Config.Labels.contextVersionId;
  var query = {
    '_id': instanceId,
    'contextVersion.id': contextVersionId
  };
  var updateData = {
    container: {
      dockerContainer: this.data.id,
      dockerHost: this.data.host,
      inspect: this.data.inspectData,
      ports: this.data.inspectData.NetworkSettings.Ports
    }
  };
  var self = this;
  log.info(put({
    query: query,
    updateData: updateData
  }, this.logData), 'OnInstanceContainerCreateWorker.prototype._updateInstance query');
  Instance.findOneAndUpdate(query, {
    '$set': updateData
  }, function (err, result) {
    if (err) {
      log.warn(put({
        err: err
      }, self.logData), '_updateInstance findOneAndUpdate error');
      return updateInstanceCb(err);
    }
    else if (!result) {
      log.warn(self.logData, '_updateInstance findOneAndUpdate !result');
      return updateInstanceCb(new Error('instance not found'));
    }
    else {
      log.info(put({
        instance: result.toJSON()
      }, self.logData), '_updateInstance findOneAndUpdate success');
    }
    self.instance = result;
    updateInstanceCb.apply(this, arguments);
  });
};

/**
 * Set state to starting and create start task in start-instance-container queue
 * @param {Function} startContainerCb
 */
OnInstanceContainerCreateWorker.prototype._startContainer = function (startContainerCb) {
  log.info(this.logData, 'OnInstanceContainerCreateWorker.prototype._startContainer');
  var Labels = this.data.inspectData.Config.Labels;
  rabbitMQ.startInstanceContainer({
    dockerContainer: this.data.id,
    dockerHost: this.data.host,
    hostIp: this.instance.network.hostIp,
    instanceId: this.instance._id.toString(),
    networkIp: this.instance.network.networkIp,
    ownerUsername: Labels.ownerUsername,
    sessionUserGithubId: Labels.sessionUserGithubId,
    tid: this.logData.uuid,
    deploymentUuid: Labels.deploymentUuid
  });
  startContainerCb();
};
