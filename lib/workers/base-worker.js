/**
 * @module lib/workers/base-worker
 */
'use strict';

var async = require('async');
var exists = require('101/exists');
var keypather = require('keypather')();
var pick = require('101/pick');
var put = require('101/put');
var uuid = require('node-uuid');

var ContextVersion = require('models/mongo/context-version');
var Instance = require('models/mongo/instance');
var User = require('models/mongo/user');
var log = require('middlewares/logger')(__filename).log;
var messenger = require('socket/messenger');
var User = require('models/mongo/user');

module.exports = BaseWorker;

function BaseWorker (data, logData) {
  if (!logData) {
    logData = data || {};
  }
  log.info('BaseWorker constructor');
  data = data || {};
  this.data = data;
  this.logData = put({
    tx: true,
    elapsedTimeSeconds: new Date(),
    uuid: uuid.v4()
  }, logData);
}

/**
 * find contextVersion
 * @param {Object} query
 * @param {Function} findCvCb
 * @private
 */
BaseWorker.prototype._baseWorkerFindContextVersion = function (query, findCvCb) {
  log.info(this.logData,
           'BaseWorker.prototype._baseWorkerFindContextVersion');
  var self = this;
  ContextVersion.findOne(query, function (err, result) {
    if (err) {
      log.error(put({
          err: err
        }, self.logData),
        '_baseWorkerFindContextVersion: findOne error'
      );
      return findCvCb(err);
    }
    else if (!result) {
      log.error(
        self.logData,
        '_baseWorkerFindContextVersion: not found'
      );
      return findCvCb(new Error('contextVersion not found'));
    }
    log.trace(put({
        contextVersion: pick(result, ['_id', 'name', 'owner'])
      }, self.logData),
      '_baseWorkerFindContextVersion: findOne success'
    );
    self.contextVersion = result;
    findCvCb(null, result);
  });
};

/**
 * Emit eventName via primus of instance updates
 * @param {String} eventName
 */
BaseWorker.prototype._baseWorkerUpdateInstanceFrontend = function (eventName) {
  log.info(put({
    eventName: eventName
  }, this.logData), 'BaseWorker.prototype._baseWorkerUpdateInstanceFrontend');
  var self = this;
  if (!keypather.get(this, 'data.instanceId')) {
    log.error(this.logData,
              '_baseWorkerUpdateInstanceFrontend: !data.instanceId');
    return;
  }
  Instance.findById(this.instanceId, function (err, instance) {
    if (err) {
      log.error(put({
        err: err
      }, self.logData), '_baseWorkerUpdateInstanceFrontend fetchInstance error');
      return;
    }
    else if (!instance) {
      log.error(self.logData, '_baseWorkerUpdateInstanceFrontend fetchInstance instance not found');
      return;
    }
    instance.populateModels(function (err) {
      if (err) {
        log.error(put({
          err: err
        }, self.logData), '_baseWorkerUpdateInstanceFrontend instance.populateModels error');
      }
      else {
        instance.populateOwnerAndCreatedBy(self.user, function (err, instance) {
          if (err) {
            log.error(put({
              err: err
            }, self.logData), '_baseWorkerUpdateInstanceFrontend '+
              'instance.populateOwnerAndCreatedBy error');
            return;
          }
          log.trace(self.logData,
                    '_baseWorkerUpdateInstanceFrontend instance.populateOwnerAndCreatedBy success');
          messenger.emitInstanceUpdate(instance, eventName);
        });
      }
    });
  });
};

/**
 * Emit primus event to frontend notifying of success or failure of a build of a contextVersion
 * @param {String} eventName
 */
BaseWorker.prototype._baseWorkerUpdateContextVersionFrontend = function (eventName, cb) {
  log.info(this.logData, 'BaseWorker.prototype._baseWorkerUpdateContextVersionFrontend');
  var cvStatusEvents = ['build_started', 'build_running', 'build_complete'];
  var self = this;
  if (cvStatusEvents.indexOf(eventName) === -1) {
    return cb(new Error('Attempted status update contained invalid event'));
  }
  this._baseWorkerFindContextVersion({
    '_id': self.contextVersionId
  }, function (err, contextVersion) {
    if (err) {
      log.error(put({
        err: err
      }, self.logData), '_baseWorkerUpdateContextVersionFrontend: emitting update failed');
    } else if (contextVersion) {
      log.info(self.logData, '_baseWorkerUpdateContextVersionFrontend: emitting update success');
      messenger.emitContextVersionUpdate(contextVersion, eventName);
    }
    cb(err);
  });
};

/**
 * Assert that docker-listener provided job data contains necessary keys
 * @param {Function} validateDieDataCb
 */
BaseWorker.prototype._baseWorkerValidateDieData = function (validateDieDataCb) {
  log.info(this.logData, 'BaseWorker.prototype._baseWorkerValidateDieData');
  var requiredKeys = [
    'from',
    'host',
    'id',
    'time',
    'uuid'
  ];
  var self = this;
  var key;
  for(var i = 0, len = requiredKeys.length; i < len; i++) {
    key = requiredKeys[i];
    if (!exists(self.data[key])) {
      var error = new Error('_baseWorkerValidateDieData: die event data missing key: '+key);
      log.error(put({
        err: error,
        key: key
      }, self.logData), '_baseWorkerValidateDieData: missing required key');
      return validateDieDataCb(error);
    }
  }
  validateDieDataCb();
};

/**
 * find instance and verify specified container is still attached.
 *   - if container is no longer attached (instance not found), worker is done
 * @param {Function} findInstanceCb
 */
BaseWorker.prototype._baseWorkerFindInstance = function (findInstanceCb) {
  log.info(this.logData, 'BaseWorker.prototype._baseWorkerFindInstance ');
  var self = this;
  Instance.findOne({
    '_id': self.data.instanceId,
    'container.dockerContainer': self.data.dockerContainer
  }, function (err, result) {
    if (err) {
      log.warn(put({
        err: err
      }, self.logData), '_baseWorkerFindInstance: findOne error');
      return findInstanceCb(err);
    }
    else if (!result) {
      log.warn(self.logData, '_baseWorkerFindInstance: not found');
      return findInstanceCb(new Error('instance not found'));
    }
    log.trace(put({
      instance: pick(result, ['_id', 'name', 'owner']),
      container: pick(result.container, ['dockerContainer', 'dockerHost'])
    }, self.logData), '_baseWorkerFindInstance: findOne success');
    self.instance = result;
    findInstanceCb.apply(this, arguments);
  });
};

/**
 * find user, used to join primus org room
 * @param {Function} findUserCb
 */
BaseWorker.prototype._baseWorkerFindUser = function (findUserCb) {
  log.info(this.logData, 'BaseWorker.prototype._baseWorkerFindUser:');
  var self = this;
  User.findByGithubId(this.data.sessionUserGithubId, function (err, result) {
    if (err) {
      log.warn(put({
        err: err
      }, self.logData), '_baseWorkerFindUser: findByGithubId error');
      return findUserCb(err);
    }
    else if(!result) {
      log.warn(self.logData, '_baseWorkerFindUser: findByGithubId not found');
      return findUserCb(new Error('user not found'));
    }
    log.trace(put({
      user: result.toJSON()
    }, self.logData), '_baseWorkerFindUser: findByGithubId success');
    self.user = result;
    findUserCb.apply(this, arguments);
  });
};

/**
 * TODO once we have proper inspect job
 *
 * Attempt to inspect container X times.
 *   - If operation fails X times, update database w/ inspect error
 *   - If success, update database w/ container inspect
 * @param {Function} inspectContainerAndUpdateCb
 */
BaseWorker.prototype
._baseWorkerInspectContainerAndUpdate = function (inspectContainerAndUpdateCb) {
  log.info(this.logData, 'BaseWorker.prototype._inspectContainerAndUpdate');
  var self = this;
  var attemptCount = 0;
  async.retry({
    times: process.env.WORKER_INSPECT_CONTAINER_NUMBER_RETRY_ATTEMPTS
  }, function (cb) {
    self.docker.inspectContainer(self.data.dockerContainer, function (err, result) {
      attemptCount++;
      if (err) {
        log.warn(put({
          err: err,
          attemptCount: attemptCount
        }, self.logData), '_baseWorkerInspectContainerAndUpdate: inspectContainer error');
        return cb(err);
      }
      log.trace(put({
        inspect: result
      }, self.logData), '_baseWorkerInspectContainerAndUpdate: inspectContainer success');
      cb(null, result);
    });
  }, function (err, result) {
    if (err) {
      log.warn(put({
        err: err,
        attemptCount: attemptCount
      }, self.logData),
      '_baseWorkerInspectContainerAndUpdate: inspectContainer async.retry final error');
      self.instance.modifyContainerInspectErr(self.data.dockerContainer, err, function (err2) {
        if (err2) {
          log.warn(put({
            err: err2
          }, self.logData), '_baseWorkerInspectContainerAndUpdate: inspectContainer '+
            'async.retry final error updateInspectError error');
        }
        return inspectContainerAndUpdateCb(err);
      });
    }
    else {
      log.trace(put({
        attemptCount: attemptCount
      }, self.logData),
      '_baseWorkerInspectContainerAndUpdate: inspectContainer async.retry final success');
      self.instance.modifyContainerInspect(self.data.dockerContainer,
                                           result,
                                           function (err2, _instance) {
        if (err2) {
          log.warn(put({
            err: err2
          }, self.logData), '_baseWorkerInspectContainerAndUpdate: modifyContainerInspect '+
            'async.retry final error updateInspectError error');
          return inspectContainerAndUpdateCb(err2);
        }
        log.trace(self.logData, '_baseWorkerInspectContainerAndUpdate: modifyContainerInspect '+
                  'async.retry final success');
        // updated instance w/ ports on container inspect for remaining network attach operations
        self.instance.container = _instance.container;
        return inspectContainerAndUpdateCb();
      });
    }
  });
};
