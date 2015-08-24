/**
 * @module lib/workers/on-instance-container-die
 */
'use strict';

var domain = require('domain');
var async = require('async');
var put = require('101/put');
var uuid = require('uuid');
var error = require('error');

var Instance = require('models/mongo/instance');
var logger = require('middlewares/logger')(__filename);

var log = logger.log;

function OnInstanceContainerDieWorker () {
  log.info('OnInstanceContainerDieWorker constructor');
}

module.exports = OnInstanceContainerDieWorker;

module.exports.worker = function (data, done) {
  var logData = put({
    worker: 'OnInstanceContainerDieWorker',
    tx: true,
    elapsedTimeSeconds: new Date(),
    uuid: uuid.v4(),
    data: data
  }, data);


  log.info(logData, 'OnInstanceContainerDieWorker::worker');
  var workerDomain = domain.create();
  workerDomain.on('error', function (err) {
    log.fatal(put({
      err: err
    }, logData), 'on-instance-container-die domain error');

    error.workerErrorHandler(err, data);
    // ack job and clear to prevent loop
    done();
  });
  workerDomain.run(function () {
    log.info(put({
      tx: true
    }, logData), 'hermes.subscribe on-instance-container-die start');

    var worker = new OnInstanceContainerDieWorker();
    worker.logData = logData;
    async.retry({
      times: process.env.WORKER_START_CONTAINER_NUMBER_RETRY_ATTEMPTS
    }, function (cb) {
      log.info(this.logData, 'Triggering worker handle.');
      worker.handle(data, cb);
    }, done);
  });
};


OnInstanceContainerDieWorker.prototype.handle = function (data, cb) {
  var self = this;
  log.info(self.logData, 'OnInstanceContainerDieWorker::handle');
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
    log.info(self.logData, 'found instance by id');

    instance.modifyContainerInspect(containerId, inspect, function (err) {
      if (err) {
        log.fatal(put({
          err: err,
          containerId: containerId,
          inspect: inspect
        }, self.logData), 'modifyContainerInspect failed');
        return cb(err);
      }
      log.info(self.logData, 'Modified container successfully. Emitting instance update.');
      instance.emitInstanceUpdate('container_inspect', cb);
    });
  });
};