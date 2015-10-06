/**
 * This worker should
 *  * fetch the contextVersion associated with this build
 *  * fetch build logs & update contextVersion
 *  * emit instance updates
 *  * dealloc image builder network
 *
 * @module lib/workers/on-image-builder-container-die
 */
'use strict';

require('loadenv')();
var Boom = require('dat-middleware').Boom;
var async = require('async');
var domain = require('domain');
var exists = require('101/exists');
var keypather = require('keypather')();
var put = require('101/put');
var util = require('util');

var BaseWorker = require('workers/base-worker');
var ContextVersion = require('models/mongo/context-version');
var Build = require('models/mongo/build');
var Docker = require('models/apis/docker');
var Sauron = require('models/apis/sauron.js');
var rabbitMQ = require('models/rabbitmq');
var error = require('error');
var log = require('middlewares/logger')(__filename).log;

module.exports = OnImageBuilderContainerDie;

module.exports.worker = function (data, done) {
  log.info({
    tx: true,
    data: data
  }, 'OnImageBuilderContainerDie module.exports.worker');
  var workerDomain = domain.create();
  workerDomain.runnableData = BaseWorker.getRunnableData();
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
  var sessionUserGithubId = keypather.get(
    this.data,
    'inspectData.Config.Labels.sessionUserGithubId');
  var self = this;
  async.series([
    this._baseWorkerValidateDieData.bind(this),
    this._baseWorkerFindContextVersion.bind(this, {
      'build.dockerContainer': this.data.id
    }),
    this._getBuildInfo.bind(this),
    this._deallocImageBuilderNetwork.bind(this),
    function (cb) {
      // must be wrapped in anon function because
      // self.contextVersion is populated in
      // _baseWorkerFindContextVersion
      self._baseWorkerUpdateInstanceFrontend({
        'contextVersion._id': self.contextVersion._id
      }, sessionUserGithubId, 'patch', cb);
    },
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

OnImageBuilderContainerDie.prototype._deployInstance = function (buildId) {
  log.info(this.logData, 'OnImageBuilderContainerDie.prototype._deployInstance');
  var Labels = keypather.get(this.data, 'inspectData.Config.Labels');
  var opts = {
    buildId: buildId,
    sessionUserGithubId: Labels.sessionUserGithubId,
    ownerUsername: Labels.ownerUsername
  };
  rabbitMQ.deployInstance(put(opts, Labels));
};

/**
 * Query mongo for the build document
 * @param {Function} findBuildCb
 */
OnImageBuilderContainerDie.prototype._findBuildAndEmitUpdate = function (buildInfo, findBuildCb) {
  var logData = put({
    buildInfo: buildInfo
  }, this.logData);
  log.info(logData, 'OnImageBuilderContainerDie.prototype._findBuildAndEmitUpdate');
  var self = this;
  Build.find({
    contextVersions: { $in: [self.contextVersion._id] }
  }, function (err, builds) {
    if (err) {
      log.error(put({
        err: err
      }, logData), '_findBuildAndEmitUpdate: Build.find error');
    }
    log.trace(logData, '_findBuildAndEmitUpdate: Build.find success');
    async.each(builds, function (build, cb) {
      if (!buildInfo) {
        build.modifyErrored(self.contextVersion._id, cb);
      } else {
        build.modifyCompleted(buildInfo.failed, function (err) {
          if (err || !build) {
            log.error(put({
              err: err || new Error('Couldn\'t find build to update')
            }, logData), '_findBuildAndEmitUpdate: Build.modifyCompleted error');
          }
          if (!buildInfo.failed) {
            log.trace(logData, '_findBuildAndEmitUpdate: Build.modifyCompleted success');
            self._deployInstance(build._id);
          }
          log.trace(logData, '_findBuildAndEmitUpdate: Build.modifyCompleted complete');
          cb();
        });
      }
    }, findBuildCb);
  });
};

/**
 * Fetch build container logs
 * @param {Function} getBuildInfoCb
 */
OnImageBuilderContainerDie.prototype._getBuildInfo = function (getBuildInfoCb) {
  log.info(this.logData, 'OnImageBuilderContainerDie.prototype._getBuildInfo');
  var self = this;
  var docker = new Docker(this.data.host);
  docker.getBuildInfo(this.data.id, function (err, buildInfo) {
    if (err) {
      log.error(put({
        err: err,
        buildInfo: buildInfo
      }, self.logData), '_getBuildInfo: docker.getBuildInfo error');
      self._handleBuildError(err, getBuildInfoCb);
    }
    else {
      log.trace(put({
        buildInfo: buildInfo
      }, self.logData), '_getBuildInfo: docker.getBuildInfo success');
      self._handleBuildComplete(buildInfo, getBuildInfoCb);
    }
  });
};

/**
 * Handle docker build errors
 * Update mongo and emit event to frontend + holding logic in /builds/:id/actions/build
 * @param {Object} err
 * @param {Function} handleBuildErrorCb
 */
OnImageBuilderContainerDie.prototype._handleBuildError =
function (err, handleBuildErrorCb) {
  log.info(this.logData, 'OnImageBuilderContainerDie.prototype._handleBuildError');
  var self = this;
  ContextVersion.updateBuildErrorByContainer(this.data.id, err, function (err) {
    if (err) {
      log.error(put({
        err: err
      }, self.logData),
        '_handleBuildError: contextVersion.updateBuildErrorByContainer error');
    }
    else {
      log.trace(self.logData,
        '_handleBuildError: contextVersion.updateBuildErrorByContainer success');
    }
    self._findBuildAndEmitUpdate(null, handleBuildErrorCb);
  });
};

/**
 * Handle successful & unsuccessful (user error) builds
 * Update mongo and emit event to frontend + holding logic in /builds/:id/actions/build
 * @param {Object} buildInfo
 * @param {Function} handleBuildCompleteCb
 */
OnImageBuilderContainerDie.prototype._handleBuildComplete =
function (buildInfo, handleBuildCompleteCb) {
  var self = this;
  log.info(this.logData, 'OnImageBuilderContainerDie.prototype._handleBuildComplete');

  if (buildInfo.failed) {
    var Labels = keypather.get(this.data, 'inspectData.Config.Labels');
    if (!Labels) {
      Labels = 'no labels';
    }
    var errorCode = exists(keypather.get(this.data, 'inspectData.State.ExitCode')) ?
      this.data.inspectData.State.ExitCode : '?';
    var errorMessage = 'Building dockerfile failed with errorcode: '+errorCode;
    errorMessage += ' - ' + keypather.get(Labels, 'sessionUserDisplayName');
    errorMessage += ' - [' + keypather.get(Labels, 'sessionUserUsername') + ']';
    errorMessage += ' - [' + keypather.get(Labels, 'contextVersion.appCodeVersions[0].repo') + ']';
    errorMessage += ' - [manual: ' + keypather.get(Labels, 'manualBuild') + ']';
    // reports to rollbar & slack build-failures room
    Boom.badRequest(errorMessage, {
      data: this.data,
      Labels: Labels,
      docker: {
        containerId: this.data.id,
        log: buildInfo.log
      }
    });
    log.trace(put({
      errorMessage: errorMessage
    }, this.logData), '_handleBuildComplete: sending error message to rollbar');
    buildInfo.error = {
      message: errorMessage
    };
  }

  ContextVersion.updateBuildCompletedByContainer(this.data.id, buildInfo, function (updateErr) {
    if (updateErr) {
      log.warn(put({
        err: updateErr
      }, self.logData),
        '_handleBuildComplete: contextVersion.updateBuildCompletedByContainer failure');
    }
    else {
      log.trace(self.logData,
        '_handleBuildComplete: contextVersion.updateBuildCompletedByContainer success');
    }

    self._findBuildAndEmitUpdate(buildInfo, handleBuildCompleteCb);
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
      }, self.logData), '_deallocImageBuilderNetwork: '+
        'Sauron.deleteHostFromContextVersion error');
    }
    else {
      log.trace(self.logData, '_deallocImageBuilderNetwork: '+
                'Sauron.deleteHostFromContextVersion success');
    }
    deallocImageBuilderNetworkCb();
  });
};
