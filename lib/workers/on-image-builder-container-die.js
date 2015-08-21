/**
 * @module lib/workers/on-image-builder-container-die
 */
'use strict';

require('loadenv')();

var async = require('async');

var ContextVersion = require('models/mongo/context-version');
var Sauron = require('models/apis/sauron.js');

module.exports = OnImageBuilderContainerDie;

module.exports.worker = function (data, done) {
  log.info({
    tx: true,
    data: data
  }, 'OnImageBuilderContainerDie module.exports.worker');
  var workerDomain = domain.create();
  workerDomain.on('error', function (err) {
    log.fatal({
      tx: true,
      data: data,
      err: err
    }, 'on-image-builder-container-die domain error');
    error.workerErrorHandler(err, data);
    // ack job and clear to prevent loop
    done();
  });
  workerDomain.run(function () {
    log.info(put({
      tx: true
    }, data), 'hermes.subscribe on-image-builder-container-die start');
    var worker = new StartInstanceContainerWorker();
    worker.handle(data, done);
  });
};

function OnImageBuilderContainerDie () {
  log.info('OnImageBuilderContainerDie');
}

OnImageBuilderContainerDie.prototype.handle = function (done, data) {
  this.logData = put({
    tx: true,
    elapsedTimeSeconds: new Date(),
    uuid: uuid.v4()
  }, data);

  log.info(this.logData, 'OnImageBuilderContainerDie.prototype.handle');

  this.data = data;
  var self = this;

  async.series([
    this._validateDieData.bind(this),
    this._findContextVersion.bind(this)
  ], function (err) {
    if (err) {
      log.warn(put({
        err: err
      }, self.logData), 'OnImageBuilderContainerDie.prototype.handle final error');
    }
    else {
      log.info(self.logData, 'OnImageBuilderContainerDie.prototype.handle final success');
    }
    done();
  });
};

/**
 * Assert that docker-listener provided job data contains necessary keys
 * @param {Function} validateDieDataCb
 */
OnImageBuilderContainerDie.prototype._validateDieData = function (validateDieDataCb) {
  log.info(this.logData, 'OnImageBuilderContainerDie.prototype._validateDieData');
  var requiredKeys = [
    'from',
    'host',
    'id',
    'time',
    'uuid'
  ];
  var self = this;
  requiredKeys.forEach(function (key) {
    if (!self.data[key]) {
      var error = new Error('_validateDieData: die event data missing key: '+key);
      log.error(put({
        err: error,
        key: key
      }, self.logData), '_validateDieData: missing required key');
      return validateDieDataCb(error);
    }
  });
  validateDieDataCb();
};

/**
 * Query mongo for context-version document
 * @param {Function} findContextVersionCb
 */
OnImageBuilderContainerDie.prototype._findContextVersion = function (validateDieDataCb) {
  log.info(this.logData, 'OnImageBuilderContainerDie.prototype._findContextVersion');
  var self = this;
  ContextVersion.findOneBy('build.dockerContainer', self.data.id, function (err, cv) {
    if (err) {
      log.error(put({
        err: err
      }, self.logData), '_findContextVersion: ContextVersion.findOneBy error');
      return validateDieDataCb(err);
    }
    else if (!cv) {
      var error = new Error('_findContextVersion: context version not found');
      log.warn(put({
        err: error
      }, self.logData), '_findContextVersion: ContextVersion.findOneBy context version not found');
      return validateDieDataCb(error);
    }
    log.trace(put({
      cv: cv.toJSON()
    }, self.logData), '_findContextVersion: ContextVersion.findOneBy success');
    self.contextVersion = cv;
    validateDieDataCb();
  });
};

/**
 * @param {Function} deallocImageBuilderNetworkCb
 */
OnImageBuilderContainerDie.prototype
._deallocImageBuilderNetwork = function (deallocImageBuilderNetworkCb) {
  log.info(this.logData, 'OnImageBuilderContainerDie.prototype._deallocImageBuilderNetwork ');
  var self = this;
  Sauron.deleteHostFromContextVersion(this.contextVersion, function (err) {
    if (err) {
      log.error(put({
        err: err
      }, self.logData), '_deallocImageBuilderNetwork: Sauron.deleteHostFromContextVersion error');
      return deallocImageBuilderNetworkCb(err);
    }
    log.trace(self.logData, '_deallocImageBuilderNetwork: Sauron.deleteHostFromContextVersion error');
    deallocImageBuilderNetworkCb();
  });
};


// fetch build info
// Docker.prototype.getBuildInfo

// if failure build:
//   - contextVersion.updateBuildErrorByContainer

// if success build:
//   - ContextVersion.updateBuildCompletedByContainer
//   ^ updates frontend

// possibly inherit this
OnImageBuilderContainerDie.prototype._updateFrontend = function () {
};
