/**
 * Manage starting a container on a dock with retry attempts
 * @module lib/workers/start-instance-container
 */
'use strict';

require('loadenv')();
var async = require('async');
var domain = require('domain');
var pick = require('101/pick');
var put = require('101/put');
var uuid = require('node-uuid');

var Docker = require('models/apis/docker');
var Hosts = require('models/redis/hosts');
var Instance = require('models/mongo/instance');
var Sauron = require('models/apis/sauron');
var User = require('models/mongo/user');
var error = require('error');
var log = require('middlewares/logger')(__filename).log;
var messenger = require('socket/messenger');

module.exports = StartInstanceContainerWorker;

module.exports.worker = function (data, done) {
  log.info({
    tx: true,
    data: data
  }, 'StartInstanceContainerWorker module.exports.worker');
  var workerDomain = domain.create();
  workerDomain.on('error', function (err) {
    log.fatal({
      tx: true,
      data: data,
      err: err
    }, 'start-instance-container domain error');
    error.workerErrorHandler(err, data);
    // ack job and clear to prevent loop
    done();
  });
  workerDomain.run(function () {
    log.info(put({
      tx: true
    }, data), 'hermes.subscribe start-instance-container-worker start');
    var worker = new StartInstanceContainerWorker();
    worker.handle(data, done);
  });
};

function StartInstanceContainerWorker () {
  log.info('StartInstanceContainerWorker constructor');
}

/**
 * @param {Object} data - event metadata
 *   .containerId
 *   .host
 * @param {Function} done - sends ACK signal to rabbitMQ
 *   to remove job fro queue
 */
StartInstanceContainerWorker.prototype.handle = function (data, done) {
  this.logData = put({
    tx: true,
    elapsedTimeSeconds: new Date(),
    uuid: uuid.v4()
  }, data);

  log.info(this.logData, 'StartInstanceContainerWorker.prototype.handle');

  this.data = data;
  this.docker = new Docker(data.dockerHost);
  var self = this;

  async.series([
    this._findInstance.bind(this),
    this._findUser.bind(this),
    this._setInstanceStateStarting.bind(this),
    this._startContainer.bind(this),
    this._inspectContainerAndUpdate.bind(this),
    this._attachContainerToNetwork.bind(this)
  ], function (err) {
    log.info(self.logData, '_handle: async.series callback');
    self._finalSeriesHandler(err, done);
  });
};

/**
 * Handle async.series final callback
 */
StartInstanceContainerWorker.prototype._finalSeriesHandler = function (err, done) {
  log.info(this.logData, 'StartInstanceContainerWorker.prototype._finalSeriesHandler');
  var self = this;
  if (err) {
    log.warn(put({err: err}, self.logData),
      '_finalSeriesHandler: final error');
    if (self.instance) {
      log.trace(put({err: err}, self.logData),
        '_finalSeriesHandler: final error - instance');
      /**
       * Inspect & update in case mongo state is running = false
       * but container is running and _startContainer failed due to
       * container is already running error
       */
      self._inspectContainerAndUpdate(function (err2) {
        if (err2) {
          log.warn(
            put({err: err, err2: err2}, self.logData),
            '_finalSeriesHandler: final error '+
            '- instance - self._inspectContainerAndUpdate error');
        }
        else {
          log.info(
            put({err: err}, self.logData),
            '_finalSeriesHandler: final error '+
            '- instance - self._inspectContainerAndUpdate success');
        }
        self._updateFrontend('update');
      });
    }
    else {
      log.trace(put({err: err}, self.logData),
        '_finalSeriesHandler: final error - !instance');
    }
  }
  else {
    log.info(self.logData, '_finalSeriesHandler: final success');
    self._updateFrontend('start');
  }
  done();
};

/**
 * Emit primus event to frontend notifying of start success or failure
 * @param {String} eventName
 */
StartInstanceContainerWorker.prototype._updateFrontend = function (eventName) {
  log.info(put({
    eventName: eventName
  }, this.logData), 'StartInstanceContainerWorker.prototype._updateFrontend');
  var self = this;
  Instance.findById(this.data.instanceId, function (err, instance) {
    if (err) {
      log.error(put({
        err: err
      }, self.logData), '_updateFrontend fetchInstance error');
      return;
    }
    else if (!instance) {
      log.error(self.logData, '_updateFrontend fetchInstance instance not found');
      return;
    }
    instance.populateModels(function (err) {
      if (err) {
        log.error(put({
          err: err
        }, self.logData), '_updateFrontend instance.populateModels error');
      }
      else {
        instance.populateOwnerAndCreatedBy(self.user, function (err, instance) {
          if (err) {
            log.error(put({
              err: err
            }, self.logData), '_updateFrontend instance.populateOwnerAndCreatedBy error');
            return;
          }
          log.trace(self.logData, '_updateFrontend instance.populateOwnerAndCreatedBy success');
          messenger.emitInstanceUpdate(instance, eventName);
        });
      }
    });
  });
};

/**
 * find instance and verify specified container is still attached.
 *   - if container is no longer attached (instance not found), worker is done
 * @param {Function} findInstanceCb
 */
StartInstanceContainerWorker.prototype._findInstance = function (findInstanceCb) {
  log.info(this.logData, 'StartInstanceContainerWorker.prototype._findInstance');
  var self = this;
  Instance.findOne({
    '_id': self.data.instanceId,
    'container.dockerContainer': self.data.dockerContainer
  }, function (err, result) {
    if (err) {
      log.warn(put({
        err: err
      }, self.logData), '_findInstance findOne error');
      return findInstanceCb(err);
    }
    else if (!result) {
      log.warn(self.logData, '_findInstance not found');
      return findInstanceCb(new Error('instance not found'));
    }
    log.trace(put({
      instance: pick(result, ['_id', 'name', 'owner']),
      container: pick(result.container, ['dockerContainer', 'dockerHost'])
    }, self.logData), '_findInstance findOne success');
    self.instance = result;
    findInstanceCb.apply(this, arguments);
  });
};

/**
 * find user, used to join primus org room
 * @param {Function} findUserCb
 */
StartInstanceContainerWorker.prototype._findUser = function (findUserCb) {
  log.info(this.logData, 'StartInstanceContainerWorker.prototype._findUser');
  var self = this;
  User.findByGithubId(this.data.sessionUserGithubId, function (err, result) {
    if (err) {
      log.warn(put({
        err: err
      }, self.logData), '_findUser findByGithubId error');
      return findUserCb(err);
    }
    else if(!result) {
      log.warn(self.logData, '_findUser findByGithubId not found');
      return findUserCb(new Error('user not found'));
    }
    log.trace(put({
      user: result.toJSON()
    }, self.logData), '_findUser findByGithubId success');
    self.user = result;
    findUserCb.apply(this, arguments);
  });
};

/**
 * Set instance container document state to "starting" and notify frontend
 * @param {Function} setInstanceStateStartingCb
 */
StartInstanceContainerWorker.prototype
._setInstanceStateStarting = function (setInstanceStateStartingCb) {
  log.info(this.logData, 'StartInstanceContainerWorker.prototype._setInstanceStateStarting');
  var self = this;
  this.instance.setContainerStateToStarting(function (err, _instance) {
    if (err) {
      var logErrData = put({err: err}, self.logData);
      log.error(logErrData, '_setInstanceStateStarting: '+
                'instance.setContainerStateToStarting error');
      return setInstanceStateStartingCb(err);
    }
    else if (!_instance){
      log.warn(self.logData, '_setInstanceStateStarting '+
              'instance.setContainerStateToStarting !instance '+
              'possibly already started');
    }
    else {
      log.trace(self.logData, '_setInstanceStateStarting: '+
                'instance.setContainerStateToStarting success');
      self.instance = _instance;
      self._updateFrontend('starting');
    }
    setInstanceStateStartingCb();
  });
};

/**
 * Attempt to start container X times.
 *  - after failure or success, remove "starting" state in mongo
 * @param {Function} startContainerCb
 */
StartInstanceContainerWorker.prototype._startContainer = function (startContainerCb) {
  log.info(this.logData, 'StartInstanceContainerWorker.prototype._startContainer');
  var self = this;
  var attemptCount = 0;
  async.retry({
    times: process.env.WORKER_START_CONTAINER_NUMBER_RETRY_ATTEMPTS
  }, function (cb) {
    self.docker.startUserContainer(self.data.dockerContainer,
                                   self.data.sessionUserGithubId, function (err) {
      attemptCount++;
      if (err) {
        log.warn(put({
          err: err,
          attemptCount: attemptCount
        }, self.logData), 'startContainer attempt failure');
      }
      else {
        log.trace(put({
          attemptCount: attemptCount
        }, self.logData), 'startContainer success');
      }
      cb.apply(this, arguments);
    });
  }, function (err) {
    if (err) {
      log.warn(put({
        err: err,
        attemptCount: attemptCount
      }, self.logData), 'startContainer final failure');
    }
    else {
      log.trace(put({
        attemptCount: attemptCount
      }, self.logData), 'startContainer final success');
    }
    self.instance.removeStartingStoppingStates(function (err2) {
      if (err2) {
        log.warn(put({
          err: err2,
          attemptCount: attemptCount
        }, self.logData), 'startContainer final removeStartingStoppingStates failure');
      }
      else {
        log.trace(self.logData, 'startContainer final removeStartingStoppingStates success');
      }
      startContainerCb(err);
    });
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
StartInstanceContainerWorker.prototype
._inspectContainerAndUpdate = function (inspectContainerAndUpdateCb) {
  log.info(this.logData, 'StartInstanceContainerWorker.prototype._inspectContainerAndUpdate');
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
        }, self.logData), 'inspectContainerAndUpdate: inspectContainer error');
        return cb(err);
      }
      log.trace(put({
        inspect: result
      }, self.logData), 'inspectContainerAndUpdate: inspectContainer success');
      cb(null, result);
    });
  }, function (err, result) {
    if (err) {
      log.warn(put({
        err: err,
        attemptCount: attemptCount
      }, self.logData), 'inspectContainerAndUpdate: inspectContainer async.retry final error');
      self.instance.modifyContainerInspectErr(self.data.dockerContainer, err, function (err2) {
        if (err2) {
          log.warn(put({
            err: err2
          }, self.logData), 'inspectContainerAndUpdate: inspectContainer '+
            'async.retry final error updateInspectError error');
        }
        return inspectContainerAndUpdateCb(err);
      });
    }
    else {
      log.trace(put({
        attemptCount: attemptCount
      }, self.logData), 'inspectContainerAndUpdate: inspectContainer async.retry final success');
      self.instance.modifyContainerInspect(self.data.dockerContainer,
                                           result,
                                           function (err2, _instance) {
        if (err2) {
          log.warn(put({
            err: err2
          }, self.logData), 'inspectContainerAndUpdate: modifyContainerInspect '+
            'async.retry final error updateInspectError error');
          return inspectContainerAndUpdateCb(err2);
        }
        log.trace(self.logData, 'inspectContainerAndUpdate: modifyContainerInspect '+
                  'async.retry final success');
        // updated instance w/ ports on container inspect for remaining network attach operations
        self.instance.container = _instance.container;
        return inspectContainerAndUpdateCb();
      });
    }
  });
};

/**
 * Attach host to container and upsert into weave
 * @param {Function} attachContainerToNetworkCb
 */
StartInstanceContainerWorker.prototype
._attachContainerToNetwork = function (attachContainerToNetworkCb) {
    log.info(this.logData, 'StartInstanceContainerWorker.prototype._attachContainerToNetwork');
  var sauron = new Sauron(this.data.dockerHost);
  var hosts = new Hosts();
  var data = this.data;
  var self = this;
  async.series([
    sauron.attachHostToContainer.bind(sauron, data.networkIp, data.hostIp, data.dockerContainer),
    hosts.upsertHostsForInstance.bind(hosts, data.ownerUsername, this.instance)
  ], function (err) {
    if (err) {
      log.warn(put({
        err: err
      }, self.logData), 'attachContainerToNetwork async.series error');
    }
    else {
      log.trace(self.logData, 'attachContainerToNetwork async.series success');
    }
    attachContainerToNetworkCb(err);
  });
};
