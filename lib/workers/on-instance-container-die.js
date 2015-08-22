'use strict';

var Instance = require('models/mongo/instance');
var domain = require('domain');
var logger = require('middlewares/logger')(__filename);
var log = logger.log;
var async = require('async');
var put = require('101/put');
var uuid = require('uuid');
var error = require('error');


function OnInstanceContainerDieWorker () {
  log.info('OnInstanceContainerDieWorker constructor');
}

module.exports = OnInstanceContainerDieWorker;

module.exports.worker = function (data, done) {
  var self = this;
  this.logData = put({
    tx: true,
    elapsedTimeSeconds: new Date(),
    uuid: uuid.v4(),
    data: data
  }, data);


  log.info(this.logData, 'OnInstanceContainerDieWorker module.exports.worker');
  var workerDomain = domain.create();
  workerDomain.on('error', function (err) {
    log.fatal(put({
      err: err
    }, self.logData), 'on-instance-container-die domain error');

    error.workerErrorHandler(err, data);
    // ack job and clear to prevent loop
    done();
  });
  workerDomain.run(function () {
    log.info(put({
      tx: true
    }, self.logData), 'hermes.subscribe on-instance-container-die start');

    var worker = new OnInstanceContainerDieWorker();
    async.retry({
      times: process.env.WORKER_START_CONTAINER_NUMBER_RETRY_ATTEMPTS
    }, function (cb) {
      worker.handle(data, cb);
    }, done);
  });
};


OnInstanceContainerDieWorker.prototype.handle = function (data, cb) {
  var self = this;

  var containerId = data.id;
  var inspect = data.inspectData;
  Instance.findOneByContainerId(containerId, function (err, instance) {
    if (err) {
      log.fatal(put({
        err: err,
        containerId: containerId
      }, self.logData), 'Instance with container not found');
      return cb(new Error('Instance with container not found'));
    }
    instance.modifyContainerInspect(containerId, inspect, cb);
  });
};