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
var pluck = require('101/pluck');
var put = require('101/put');
var util = require('util');

var BaseWorker = require('workers/base-worker');
var ContextVersion = require('models/mongo/context-version');
var Build = require('models/mongo/build');
var Docker = require('models/apis/docker');
var Instance = require('models/mongo/instance');
var Sauron = require('models/apis/sauron.js');
var User = require('models/mongo/user');
var messenger = require('socket/messenger');
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
  var self = this;
  async.series([
    this._baseWorkerValidateDieData.bind(this),
    this._validateDieData.bind(this, [
      'inspectData.Config.Labels.sessionUserGithubId',
      'inspectData.Name'
    ]),
    this._getBuildInfo.bind(this),
    this._deallocImageBuilderNetwork.bind(this),
    this._emitInstanceUpdateEvents.bind(this)
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
OnImageBuilderContainerDie.prototype._handleBuildError = function (err, cb) {
  log.info(this.logData, 'OnImageBuilderContainerDie.prototype._handleBuildError');
  var self = this;
  ContextVersion.updateBuildErrorByContainer(this.data.id, err, function (err, versions) {
    if (err) {
      log.error(put({
        err: err
      }, self.logData),
        '_handleBuildError: contextVersion.updateBuildErrorByContainer error');
      return cb(err);
    }
    log.trace(self.logData,
      '_handleBuildError: contextVersion.updateBuildErrorByContainer success');
    var versionIds = versions.map(pluck('_id'));
    Build.updateFailedByContextVersionIds(versionIds, cb);
  });
};

/**
 * Handle successful & unsuccessful (user error) builds
 * Update mongo and emit event to frontend + holding logic in /builds/:id/actions/build
 * @param {Object} buildInfo
 * @param {Function} cb
 */
OnImageBuilderContainerDie.prototype._handleBuildComplete = function (buildInfo, cb) {
  var self = this;
  log.info(this.logData, 'OnImageBuilderContainerDie.prototype._handleBuildComplete');

  if (buildInfo.failed) {
    this._reportBuildFailure(buildInfo);
  }

  ContextVersion.updateBuildCompletedByContainer(this.data.id, buildInfo, function (err, versions) {
    if (err) {
      log.warn(
        put({ err: err }, self.logData),
        '_handleBuildComplete: contextVersion.updateBuildCompletedByContainer failure'
      );
      return cb(err);
    }
    log.trace(
      self.logData,
      '_handleBuildComplete: contextVersion.updateBuildCompletedByContainer success'
    );

    var versionIds = versions.map(pluck('_id'));
    if (buildInfo.failed) {
      Build.updateFailedByContextVersionIds(versionIds, cb);
    } else {
      self._handleBuildSuccess(versionIds, cb);
    }
  });
};

/**
 * Handle successful cv's, mark builds as complete and deploy instances
 * Update mongo and emit event to frontend + holding logic in /builds/:id/actions/build
 * @param {Array}    versionIds - successful contextVersion ids
 * @param {Function} cb
 */
OnImageBuilderContainerDie.prototype._handleBuildSuccess = function (versionIds, cb) {
  var self = this;
  log.info(this.logData, 'OnImageBuilderContainerDie.prototype._handleBuildSuccess');
  Build.updateCompletedByContextVersionIds(versionIds, function (err) {
    if (err) { return cb(err); }
    Build.findByContextVersionIds(versionIds, function (err, builds) {
      if (err) {
        log.warn(
          put({ err: err }, self.logData),
          '_handleBuildSuccess: Build.findByContextVersionIds failure'
        );
        return cb(err);
      }
      log.trace(
        self.logData,
        '_handleBuildSuccess: Build.findByContextVersionIds success'
      );
      builds.forEach(function (build) {
        var buildId = build._id;
        self._deployInstance(buildId);
      });
      cb();
    });
  });
};

/**
 * reports to rollbar & slack build-failures room
 * @param  {Object} buildInfo
 */
OnImageBuilderContainerDie.prototype._reportBuildFailure = function (buildInfo) {
  log.info(this.logData, 'OnImageBuilderContainerDie.prototype._reportBuildFailure');
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
  var err = Boom.badRequest(errorMessage, {
    data: this.data,
    Labels: Labels,
    docker: {
      containerId: this.data.id,
      log: buildInfo.log
    }
  });
  error.log(err);
  log.trace(
    put({ errorMessage: errorMessage }, this.logData),
    '_handleBuildComplete: sending error message to rollbar'
  );
};

/**
 * emit instance update events after context versions have been marked as completed (or errored)
 * @param  {Function} cb callback
 */
OnImageBuilderContainerDie.prototype._emitInstanceUpdateEvents = function (cb) {
  var self = this;
  var sessionUserGithubId = keypather.get(
    this.data,
    'inspectData.Config.Labels.sessionUserGithubId'
  );
  User.findByGithubId(sessionUserGithubId, function (err, sessionUser) {
    if (err) { return cb(err); }
    // image-builder container names are set to be their corresponding cv.build._id
    var query = {
      'contextVersion.build._id': self.data.inspectData.Name
    };
    Instance.findAndPopulate(sessionUser, query, function (err, instances) {
      if (err) { return cb(err); }
      instances.forEach(function (instance) {
        messenger.emitInstanceUpdate(instance, 'patch');
      });
      cb();
    });
  });
};

/**
 * @param {Function} deallocImageBuilderNetworkCb
 */
OnImageBuilderContainerDie.prototype._deallocImageBuilderNetwork =
  function (deallocImageBuilderNetworkCb) {
    log.info(this.logData, 'OnImageBuilderContainerDie.prototype._deallocImageBuilderNetwork');
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
