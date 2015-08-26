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
var keypather = require('keypather')();
var pick = require('101/pick');
var put = require('101/put');
var uuid = require('node-uuid');
var createCount = require('callback-count');

var Docker = require('models/apis/docker');
var InfraCodeVersion = require('models/mongo/infra-code-version');
var ContextVersion = require('models/mongo/context-version');
var Context = require('models/mongo/context');
var Sauron = require('models/apis/sauron');
var error = require('error');
var log = require('middlewares/logger')(__filename).log;
var messenger = require('socket/messenger');
module.exports = CreateImageBuilderContainerWorker;

module.exports.worker = function (data, done) {
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
    }, data), 'hermes.subscribe create-image-builder-container-worker start');
    var worker = new CreateImageBuilderContainerWorker();
    worker.handle(data, done);
  });
};

function CreateImageBuilderContainerWorker () {
  log.info('CreateImageBuilderContainerWorker constructor');
}

/**
 * This should be attached to the Docker-Listen event for the creation of build containers
 * @param data
 * @param done
 */
CreateImageBuilderContainerWorker.prototype.handle = function (data, done) {
  this.manualBuild = data.manualBuild;
  this.sessionUser = data.sessionUser;
  this.contextId = data.contextId;
  this.contextVersionId = data.contextVersionId;
  this.dockerHost = data.dockerHost;
  this.noCache = data.noCache;

  this.logData = put({
    tx: true,
    elapsedTimeSeconds: new Date(),
    uuid: uuid.v4()
  }, data);

  var self = this;

  this.sauron = new Sauron(this.dockerHost);
  async.series([
    this._findContext.bind(this),
    this._findOrCreateHost.bind(this),
    this._findContextVersion.bind(this),
    this._populateInfraCodeVersion.bind(this),
    this._createImageBuilder.bind(this),
    this._updateContextVersionWithContainer.bind(this)
  ], function (err) {
    if (err) {
      log.error(put({
        err: err
      }, self.logData), 'CreateImageBuilderContainerWorker.prototype.handle final error');
      if (self.contextVersion) {
        return self._onError(err, done);
      }
    }
    else {
      log.info(
        self.logData,
        'CreateImageBuilderContainerWorker.prototype.handle final success'
      );
      self._updateFrontend(done);
    }
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
 * _findContextVersion finds the contextVersion
 * @param dockerContainerExistsOnModel
 * @param findCvCb
 * @private
 */
CreateImageBuilderContainerWorker.prototype.
    _findContextVersion = function (dockerContainerExistsOnModel, findCvCb) {
  log.info(this.logData, 'CreateImageBuilderContainerWorker.prototype._findContextVersion');
  var self = this;
  if (typeof dockerContainerExistsOnModel === 'function') {
    findCvCb = dockerContainerExistsOnModel;
    dockerContainerExistsOnModel = false;
  }
  ContextVersion.findOne({
    '_id': self.contextVersionId,
    'build.dockerContainer': {
      $exists: dockerContainerExistsOnModel
    },
    'build.started': {
      $exists: true
    },
    'build.finished': {
      $exists: false
    }
  }, function (err, result) {
    if (err) {
      log.error(put({
          err: err
        }, self.logData),
        'CreateImageBuilderContainerWorker _findContextVersion findOne error'
      );
      return findCvCb(err);
    }
    else if (!result) {
      log.error(
        self.logData,
        'CreateImageBuilderContainerWorker _findContextVersion not found'
      );
      return findCvCb(new Error('contextVersion not found'));
    }
    log.trace(put({
        contextVersion: pick(result, ['_id', 'name', 'owner'])
      }, self.logData),
      'CreateImageBuilderContainerWorker _findContextVersion findOne success'
    );
    self.contextVersion = result;
    findCvCb(null, result);
  });
};

/**
 * Populates the infracode version on the contextVersion on this
 * @param cb
 * @private
 */
CreateImageBuilderContainerWorker.prototype._populateInfraCodeVersion = function (cb) {
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
  log.info(self.logData, 'CreateImageBuilderContainerWorker.prototype._findOrCreateHost');

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
  log.info(this.logData, 'CreateImageBuilderContainerWorker.prototype._createImageBuilder');
  var self = this;
  var docker = new Docker(this.dockerHost);
  this.dockerTag = docker.getDockerTag(this.sessionUser, this.contextVersion);
  var attemptCount = 1;
  async.retry({
    times: process.env.WORKER_CREATE_CONTAINER_NUMBER_RETRY_ATTEMPTS,
    interval: process.env.WORKER_DOCKER_RETRY_INTERVAL
  }, function (cb) {
    docker.createImageBuilder(
      self.manualBuild,
      self.sessionUser,
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
  log.info(
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
 * Emit primus event to frontend notifying of success or failure
 */
CreateImageBuilderContainerWorker.prototype._updateFrontend = function (cb) {
  var self = this;
  log.info(this.logData, 'CreateImageBuilderContainerWorker.prototype._updateFrontend');

  this._findContextVersion(true, function (err, contextVersion) {
    if (err) {
      log.error(put({
        err: err
      }, self.logData), 'CreateImageBuilderContainerWorker emitting update failed');
    } else if (contextVersion) {
      log.info(self.logData, 'CreateImageBuilderContainerWorker emitting update success');
      messenger.emitContextVersionUpdate(contextVersion, 'build_started');
      cb();
    }
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
  log.info(self.logData, 'CreateImageBuilderContainerWorker.prototype._onError');
  var count = createCount(1, function () {
    onErrorCb.apply(this, arguments);
  });
  if (self.network) {
    var attemptCount = 1;
    count.inc();
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
      count.next(err);
    });
  }
  ContextVersion.updateBuildErrorByBuildId(self.contextVersion.build._id, error, function (err) {
    if (err) {
      log.error(
        put({
          err: err
        }, self.logData),
        'CreateImageBuilderContainerWorker updateBuildErrorByBuildId failed');
    }
    count.next(err);
  });
};
