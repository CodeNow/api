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
var util = require('util');

var BaseWorker = require('workers/base-worker');
var Docker = require('models/apis/docker');
var Instance = require('models/mongo/instance');
var User = require('models/mongo/user');
var error = require('error');
var log = require('middlewares/logger')(__filename).log;

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
    var worker = new StartInstanceContainerWorker(data);
    worker.handle(done);
  });
};

function StartInstanceContainerWorker (data) {
  log.info('StartInstanceContainerWorker constructor');
  BaseWorker.apply(this, arguments);
  this.instanceId = data.instanceId;
}

util.inherits(StartInstanceContainerWorker, BaseWorker);

/**
 * @param {Object} data - event metadata
 *   .containerId
 *   .host
 * @param {Function} done - sends ACK signal to rabbitMQ
 *   to remove job fro queue
 */
StartInstanceContainerWorker.prototype.handle = function (done) {
  log.info(this.logData, 'StartInstanceContainerWorker.prototype.handle');

  this.docker = new Docker(this.data.dockerHost);
  var self = this;

  async.series([
    this._findInstance.bind(this),
    this._findUser.bind(this),
    this._setInstanceStateStarting.bind(this),
    this._startContainer.bind(this)
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
      return self._updateInstanceFrontend('update', done);
    }
    else {
      log.trace(put({err: err}, self.logData),
        '_finalSeriesHandler: final error - !instance');
    }
  }
  else {
    log.info(self.logData, '_finalSeriesHandler: final success');
  }
  done();
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
      return self._updateInstanceFrontend('starting', setInstanceStateStartingCb);
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
        if (err.statusCode === 304) {
          log.warn(put({
            err: err,
            attemptCount: attemptCount
          }, self.logData), 'startContainer attempt failure - container already started');
          // container already started
          // call back without error and allow worker to proceed
          return cb(null);
        }
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