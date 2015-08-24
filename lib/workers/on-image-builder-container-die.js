/**
 * @module lib/workers/on-image-builder-container-die
 */
'use strict';

require('loadenv')();
var async = require('async');
var domain = require('domain');
var put = require('101/put');
var util = require('util');
var uuid = require('node-uuid');

var BaseWorker = require('workers/base-worker');
var ContextVersion = require('models/mongo/context-version');
var Sauron = require('models/apis/sauron.js');
var error = require('error');
var log = require('middlewares/logger')(__filename).log;

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
    var worker = new OnImageBuilderContainerDie(data);
    worker.handle(done);
  });
};

function OnImageBuilderContainerDie () {
  log.info('OnImageBuilderContainerDie');
  BaseWorker.apply(this, arguments);
}

util.inherits(OnImageBuilderContainerDie, BaseWorker);

/**
 * @param {Object} data
 * @param {Function} done
 */
OnImageBuilderContainerDie.prototype.handle = function (done) {
  log.info(this.logData, 'OnImageBuilderContainerDie.prototype.handle');
  var self = this;
  async.series([
    this._validateDieData.bind(this),
    this._findContextVersion.bind(this)
  ], function (err) {
    log.info(self.logData, '_handle: async.series callback');
    self._finalSeriesHandler(err, done);
  });
};

/**
 * @param {Object} err
 * @param {Function} done - sends ACK signal to rabbitMQ
 */
OnImageBuilderContainerDie.prototype._finalSeriesHandler = function (err, done) {
  log.info(this.logData, 'OnImageBuilderContainerDie.prototype._finalSeriesHandler');
  var self = this;
  if (err) {
    log.warn(put({
      err: err
    }, self.logData), 'OnImageBuilderContainerDie.prototype.handle final error');
  }
  else {
    log.info(self.logData, 'OnImageBuilderContainerDie.prototype.handle final success');
  }
  done();
};

/**
 * Query mongo for context-version document
 * @param {Function} findContextVersionCb
 */
OnImageBuilderContainerDie.prototype._findContextVersion = function (findContextVersionCb) {
  log.info(this.logData, 'OnImageBuilderContainerDie.prototype._findContextVersion');
  var self = this;
  ContextVersion.findOneBy('build.dockerContainer', self.data.id, function (err, cv) {
    if (err) {
      log.error(put({
        err: err
      }, self.logData), '_findContextVersion: ContextVersion.findOneBy error');
      return findContextVersionCb(err);
    }
    else if (!cv) {
      var error = new Error('_findContextVersion: context version not found');
      log.warn(put({
        err: error
      }, self.logData), '_findContextVersion: ContextVersion.findOneBy context version not found');
      return findContextVersionCb(error);
    }
    log.trace(put({
      cv: cv.toJSON()
    }, self.logData), '_findContextVersion: ContextVersion.findOneBy success');
    self.contextVersion = cv;
    findContextVersionCb();
  });
};

/**
 * Fetch build container logs
 * @param {Function} getBuildInfoCb
 */
OnImageBuilderContainerDie.prototype._getBuildInfo = function (getBuildInfoCb) {
  log.info(this.logData, 'OnImageBuilderContainerDie.prototype._getBuildInfo');
  var self = this;
  this.docker.getBuildInfo(this.data.id, function (err, buildInfo) {
    if (err) {
      log.error(put({
        err: err,
        buildInfo: buildInfo
      }, self.logData), '_getBuildInfo: docker.getBuildInfo error');
      self._handleBuildError(buildInfo, getBuildInfoCb);
    }
    else if (buildInfo.failed) {
      log.warn(put({
        buildInfo: buildInfo
      }, self.logData), '_getBuildInfo: docker.getBuildInfo buildInfo.failed');
      // ContextVersion.updateBuildErrorByContainer(containerId, err, cb);
      self._handleBuildError(buildInfo, getBuildInfoCb);
    }
    else {
      // ContextVersion.updateBuildCompletedByContainer(containerId, buildInfo, cb);
      log.info(put({
        buildInfo: buildInfo
      }, self.logData), '_getBuildInfo: docker.getBuildInfo success');
      self._handleBuildSuccess(buildInfo, getBuildInfoCb);
    }
  });
};

/**
 * @param {Object} buildInfo
 * @param {Function} handleBuildErrorCb
 */
OnImageBuilderContainerDie.prototype._handleBuildError =
function (buildInfo, handleBuildErrorCb) {
  log.info(this.logData, 'OnImageBuilderContainerDie.prototype._handleBuildError');
};

/**
 * @param {Object} buildInfo
 * @param {Function} handleBuildSuccessCb
 */
OnImageBuilderContainerDie.prototype._handleBuildSuccess =
function (buildInfo, handleBuildSuccessCb) {
  log.info(this.logData, 'OnImageBuilderContainerDie.prototype._handleBuildSuccess');
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
      }, self.logData), '_deallocImageBuilderNetwork: '+
        'Sauron.deleteHostFromContextVersion error');
      return deallocImageBuilderNetworkCb(err);
    }
    log.trace(self.logData, '_deallocImageBuilderNetwork: '+
              'Sauron.deleteHostFromContextVersion error');
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
OnImageBuilderContainerDie.prototype._updateFrontend = function () {};
