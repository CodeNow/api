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
var uuid = require('uuid');

var Instance = require('models/mongo/instance');
var error = require('error');
var logger = require('middlewares/logger')(__filename);
var rabbitMQ = require('models/rabbitmq');

var log = logger.log;

module.exports = OnInstanceContainerCreateWorker;

module.exports.worker = function (data, done) {
  var workerDomain = domain.create();
  workerDomain.on('error', function (err) {
    error.workerErrorHandler(err, done);
  });
  workerDomain.run(function () {
    log.info(put({
      tx: true
    }, data), 'hermes.subscribe on-instance-container-create-worker start');
    var worker = new OnInstanceContainerCreateWorker();
    worker.handle(data, done);
  });
};

function OnInstanceContainerCreateWorker () {
  log.info('OnInstanceContainerCreateWorker constructor');
}

/**
 * @param {Object} data - event metadata
 *   .containerId
 *   .host
 * @param {Function} done - sends ACK signal to rabbitMQ
 *   to remove job fro queue
 */
OnInstanceContainerCreateWorker.prototype.handle = function (data, done) {
  this.logData = put({
    tx: true,
    elapsedTimeSeconds: new Date(),
    uuid: uuid.v4()
  }, data);

  log.info(this.logData, 'StartInstanceContainerWorker.prototype.handle');

  this.instance = null;
  this.data = data;
  var self = this;

  async.series([
    this._updateInstance.bind(this),
    this._startContainer.bind(this)
  ], function (err) {
    if (err) {
      log.warn(put({
        err: err
      }, self.logData), 'StartInstanceContainerWorker.prototype.handle final error');
    }
    else {
      log.info(self.logData, 'StartInstanceContainerWorker.prototype.handle final success');
    }
    done();
  });
};

/**
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
    tid: this.logData.uuid
  });
  startContainerCb();
};
