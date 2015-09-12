/**
 * Create host and container for building an image
 * 
 * This worker should
 *  * fetch the contextVersion
 *  * use Sauron to find or create a host
 *  * create the image builder
 *  * save image builder container info to context version
 *  
 *
 * @module lib/workers/create-image-builder-container
 */
'use strict';

require('loadenv')();
var async = require('async');
var domain = require('domain');
var pick = require('101/pick');
var put = require('101/put');
var util = require('util');

var BaseWorker = require('workers/base-worker');
var Context = require('models/mongo/context');
var ContextVersion = require('models/mongo/context-version');
var Docker = require('models/apis/docker');
var Sauron = require('models/apis/sauron');
var error = require('error');
var log = require('middlewares/logger')(__filename).log;

module.exports = CreateImageBuilderContainerWorker;

module.exports.worker = function (data, done) {
  var workerDomain = domain.create();
  workerDomain.on('error', function (err) {
    log.fatal({
      tx: true,
      data: data,
      err: err
    }, 'create-image-builder-container domain error');
    error.workerErrorHandler(err, data);
    // ack job and clear to prevent loop
    done();
  });
  workerDomain.run(function () {
    log.trace(put({
      tx: true
    }, data), 'hermes.subscribe create-image-builder-container-worker start');
    var worker = new CreateImageBuilderContainerWorker(data);
    worker.handle(done);
  });
};

function CreateImageBuilderContainerWorker (data) {
  log.trace('CreateImageBuilderContainerWorker constructor');
  this.contextId = data.contextId;
  this.contextVersionId = data.contextVersionId;
  this.dockerHost = data.dockerHost;
  this.manualBuild = data.manualBuild;
  this.noCache = data.noCache;
  this.sessionUserGithubId = data.sessionUserGithubId;
  BaseWorker.apply(this, [data, {
    sessionUserGithubId: data.sessionUserGithubId,
    dockerHost: data.dockerHost
  }]);
}

util.inherits(CreateImageBuilderContainerWorker, BaseWorker);

/**
 * This handler is fired from an event happening right after a user requests a build
 * @param done
 */
CreateImageBuilderContainerWorker.prototype.handle = function (done) {
  log.info(this.logData, 'CreateImageBuilderContainerWorker.prototype.handle');
  var self = this;
  this.sauron = new Sauron(this.dockerHost);
  async.series([
    this._baseWorkerFindUser.bind(this, self.sessionUserGithubId),
    this._findContext.bind(this),
    this._findOrCreateHost.bind(this),
    function (cb) {
      self._baseWorkerFindContextVersion({
        '_id': self.contextVersionId,
        'build.dockerContainer': {
          $exists: false
        },
        'build.started': {
          $exists: true
        },
        'build.finished': {
          $exists: false
        }
      }, cb);
    },
    this._populateInfraCodeVersion.bind(this),
    this._createImageBuilder.bind(this),
    this._updateContextVersionWithContainer.bind(this),
    this._baseWorkerUpdateContextVersionFrontend.bind(this, 'build_started')
  ], function (err) {
    if (err) {
      log.error(put({
        err: err
      }, self.logData), 'CreateImageBuilderContainerWorker.prototype.handle final error');
      if (self.contextVersion) {
        return self._onError(err, done);
      } else {
        return done();
      }
    }
    else {
      log.trace(
        self.logData,
        'CreateImageBuilderContainerWorker.prototype.handle final success'
      );
    }
    done();
  });
};

/**
 * find context
 * @param {Function} findContextCb
 */
CreateImageBuilderContainerWorker.prototype._findContext = function (findContextCb) {
  log.info(this.logData, 'CreateImageBuilderContainerWorker.prototype._findContext');
  var self = this;
  Context.findOne({
    '_id': self.contextId
  }, function (err, result) {
    if (err) {
      log.error(put({
          err: err
        }, self.logData),
        'CreateImageBuilderContainerWorker _findContext findOne error'
      );
      return findContextCb(err);
    }
    else if (!result) {
      log.error(
        self.logData,
        'CreateImageBuilderContainerWorker _findContext not found'
      );
      return findContextCb(new Error('context not found'));
    }
    log.trace(put({
        context: pick(result, ['_id', 'name', 'owner'])
      }, self.logData),
      'CreateImageBuilderContainerWorker _findContext findOne success'
    );
    self.context = result;
    findContextCb();
  });
};

/**
 * Populates the infracodeversion on the contextVersion on this
 * @param cb
 * @private
 */
CreateImageBuilderContainerWorker.prototype._populateInfraCodeVersion = function (cb) {
  log.info(this.logData, 'CreateImageBuilderContainerWorker.prototype._populateInfraCodeVersion');
  var self = this;
  this.contextVersion.populate('infraCodeVersion', function (err) {
    if (err) {
      log.error(put({
          err: err
        }, self.logData),
        'CreateImageBuilderContainerWorker populate infracodeVersion error'
      );
    }
    cb(err);
  });
};

/**
 * Tries to find or create the Sauron host for the context X amount of times
 * @param findCreateCb
 * @private
 */
CreateImageBuilderContainerWorker.prototype._findOrCreateHost = function (findCreateCb) {
  var self = this;
  log.trace(self.logData, 'CreateImageBuilderContainerWorker.prototype._findOrCreateHost');

  var attemptCount = 1;
  async.retry({
    times: process.env.WORKER_SAURON_RETRY_ATTEMPTS,
    interval: process.env.WORKER_SAURON_RETRY_INTERVAL
  }, function (cb) {
    self.sauron.findOrCreateHostForContext(self.context, function (err, sauronResult) {
      if (err) {
        log.error(put({
            err: err
          }, self.logData),
          'CreateImageBuilderContainerWorker findOrCreateHostForContext attempt failure'
        );
      } else {
        self.network = sauronResult;
        log.trace(put({
          context: pick(self.context, ['_id', 'owner']),
          network: sauronResult
        }, self.logData), 'CreateImageBuilderContainerWorker findOrCreateHostForContext success');
      }
      cb.apply(this, arguments);
    });
  }, function (err) {
    if (err) {
      log.error(put({
        err: err,
        attemptCount: attemptCount
      }, self.logData), 'CreateImageBuilderContainerWorker _findOrCreateHost final failure');
    }
    else {
      log.trace(put({
        attemptCount: attemptCount
      }, self.logData), 'CreateImageBuilderContainerWorker _findOrCreateHost final success');
    }
    findCreateCb(err);
  });
};

/**
 * Attempt to create the image builder container X times.
 * @param {Function} createImageCb
 */
CreateImageBuilderContainerWorker.prototype._createImageBuilder = function (createImageCb) {
  log.trace(this.logData, 'CreateImageBuilderContainerWorker.prototype._createImageBuilder');
  var self = this;
  var docker = new Docker(this.dockerHost);
  this.dockerTag = docker.getDockerTag(this.user, this.contextVersion);
  var attemptCount = 1;
  async.retry({
    times: process.env.WORKER_CREATE_CONTAINER_NUMBER_RETRY_ATTEMPTS,
    interval: process.env.WORKER_DOCKER_RETRY_INTERVAL
  }, function (cb) {
    docker.createImageBuilder(
      self.manualBuild,
      self.user,
      self.contextVersion,
      self.dockerTag,
      self.network,
      self.noCache,
      function (err, container) {
        if (err) {
          log.warn(put({
              err: err,
              attemptCount: attemptCount
            }, self.logData),
            'CreateImageBuilderContainerWorker _createImageBuilder attempt failure'
          );

          attemptCount++;
        }
        else {
          self.dockerContainerId = container.id;
          log.trace(put({
            attemptCount: attemptCount,
            containerId: container
          }, self.logData), 'CreateImageBuilderContainerWorker _createImageBuilder success');
        }
        cb.apply(this, arguments);
      });
  }, function (err) {
    if (err) {
      log.error(put({
        err: err,
        attemptCount: attemptCount
      }, self.logData), 'CreateImageBuilderContainerWorker _createImageBuilder final failure');
    }
    else {
      log.trace(put({
        attemptCount: attemptCount
      }, self.logData), 'CreateImageBuilderContainerWorker _createImageBuilder final success');
    }
    createImageCb(err);
  });
};

/**
 * save the container details to the contextVersion
 * @param {Function} upCvCb
 */
CreateImageBuilderContainerWorker.prototype._updateContextVersionWithContainer = function (upCvCb) {
  log.trace(
    this.logData,
    'CreateImageBuilderContainerWorker.prototype._updateContextVersionWithContainer'
  );
  var self = this;
  ContextVersion.updateContainerByBuildId({
    buildId: self.contextVersion.build._id,
    buildContainerId: self.dockerContainerId,
    tag: self.dockerTag,
    host: self.dockerHost,
    network: self.network
  }, function (err) {
    if (err) {
      log.error(put({
          err: err
        }, self.logData),
        'CreateImageBuilderContainerWorker _updateContextVersionWithContainer error');
      return upCvCb(err);
    } else {
      log.trace(put({
          contextVersion: pick(self.contextVersion, ['_id', 'name', 'owner']),
          container: {
            dockerContainer: self.dockerContainerId,
            dockerHost: self.dockerHost
          }
        }, self.logData),
        'CreateImageBuilderContainerWorker _updateContextVersionWithContainer success');
    }
    upCvCb();
  });
};

/**
 * Deletes the host on Sauron for this build container, since we failed somewhere
 * Calls the updateFrontend method to update the cv and emit the event over the socket
 * @param error
 * @param onErrorCb
 * @private
 */
CreateImageBuilderContainerWorker.prototype._onError = function (error, onErrorCb) {
  var self = this;
  log.trace(self.logData, 'CreateImageBuilderContainerWorker.prototype._onError');
  if (self.network) {
    var attemptCount = 1;
    // if the network data isn't populated, the host was never created, so don't delete it
    async.retry({
      times: process.env.WORKER_SAURON_RETRY_ATTEMPTS,
      interval: process.env.WORKER_SAURON_RETRY_INTERVAL
    }, function (cb) {
      self.sauron.deleteHost(self.network.networkIp, self.network.hostIp, function (err) {
        if (err) {
          log.warn(put({
              err: err,
              attemptCount: attemptCount
            }, self.logData),
            'CreateImageBuilderContainerWorker deleteHost attempt failure'
          );
          attemptCount++;
        }
        cb.apply(this, arguments);
      });
    }, function (err) {
      if (err) {
        log.error(put({
          err: err
        }, self.logData), 'CreateImageBuilderContainerWorker deleteSauronHost final failed');
      } else {
        log.trace(put({
          attemptCount: attemptCount,
          network: self.network
        }, self.logData), 'CreateImageBuilderContainerWorker deleteSauronHost success');
      }
      self._updateCvOnError(error, onErrorCb);
    });
  } else {
    self._updateCvOnError(error, onErrorCb);
  }
};

CreateImageBuilderContainerWorker.prototype._updateCvOnError = function (error, cb) {
  var self = this;
  ContextVersion.updateBuildErrorByBuildId(self.contextVersion.build._id, error, function (err) {
    if (err) {
      log.error(
        put({
          err: err
        }, self.logData),
        'CreateImageBuilderContainerWorker updateBuildErrorByBuildId failed');
    }
    cb(err);
  });
};
