/**
 * Delete instance in the worker. Should be robust (retriable on failure).
 * Creates `delete-instance-container` job if necessary.
 * Also creates new `delete-instance` job for all forked instances if we are deleting master.
 * @module lib/workers/delete-instance
 */
'use strict';

require('loadenv')();
var async = require('async');
var domain = require('domain');
var error = require('error');
var keypather = require('keypather')();
var put = require('101/put');
var util = require('util');

var Instance = require('models/mongo/instance');
var BaseWorker = require('workers/base-worker');
var logger = require('middlewares/logger')(__filename);
var messenger = require('socket/messenger');
var rabbitMQ = require('models/rabbitmq');

var log = logger.log;

function DeleteInstanceWorker() {
  log.info('DeleteInstanceWorker constructor');
  BaseWorker.apply(this, arguments);
}

util.inherits(DeleteInstanceWorker, BaseWorker);

module.exports = DeleteInstanceWorker;

module.exports.worker = function(data, done) {
  log.info({
    tx: true,
    data: data
  }, 'DeleteInstanceWorker module.exports.worker');
  var workerDomain = domain.create();
  workerDomain.runnableData = BaseWorker.getRunnableData();
  workerDomain.on('error', function(err) {
    log.fatal({
      tx: true,
      data: data,
      err: err
    }, 'delete-instance domain error');
    error.workerErrorHandler(err, data);
    // ack job and clear to prevent loop
    done();
  });
  workerDomain.run(function() {
    log.info(put({
      tx: true
    }, data), 'hermes.subscribe delete-instance-worker start');
    var worker = new DeleteInstanceWorker(data);
    worker.handle(done);
  });
};

/**
 * Worker callback function, handles instance deletion
 * Invokes internal API route
 * @param {Function} done - sends ACK signal to rabbitMQ
 *   to remove job from queue
 *
 * NOTE: invoked w/ callback from tests.
 *       invoked w/o callback in prod
 */
DeleteInstanceWorker.prototype.handle = function(done) {
  log.info(this.logData, 'DeleteInstanceWorker.prototype.handle');
  var self = this;
  var data = this.data;
  this._baseWorkerFindInstance({
    _id: data.instanceId
  }, function(err, instance) {
    if (err) {
      // app error, we finished with this job
      return self._handleError(err, done);
    }
    async.series([
      instance.removeSelfFromGraph.bind(instance),
      // if instance does not exist remove will not return error
      instance.remove.bind(instance), function(cb) {
        // submit delete container job only if dockerContainer
        // information is available on the instance
        if (keypather.get(instance, 'container.dockerContainer')) {
          var branch = Instance.getMainBranchName(instance);
          var deleteContainerTask = {
            instanceShortHash: instance.shortHash,
            instanceName: instance.name,
            instanceMasterPod: instance.masterPod,
            instanceMasterBranch: branch,
            container: instance.container,
            networkIp: keypather.get(instance, 'network.networkIp'),
            hostIp: keypather.get(instance, 'network.hostIp'),
            ownerGithubId: keypather.get(instance, 'owner.github'),
            sessionUserId: data.sessionUserId
          };
          rabbitMQ.deleteInstanceContainer(deleteContainerTask);
        }
        messenger.emitInstanceDelete(instance);
        // success in any case
        cb();
      },
      self._deleteForks.bind(self, instance, data.sessionUserId)
    ], function(err) {
      if (err) {
        return self._handleError(err, done);
      }
      log.trace(self.logData, 'delete-instance final success');
      done();
    });
  });
};

DeleteInstanceWorker.prototype._deleteForks = function(instance, sessionUserId, cb) {
  log.trace(this.logData, 'DeleteInstanceWorker.prototype._deleteForks');
  if (instance.masterPod !== true) {
    return cb();
  }
  var self = this;
  Instance.findInstancesByParent(instance.shortHash, function(err, instances) {
    if (err) {
      log.error(put({
        err: err
      }, self.logData),
        'DeleteInstanceWorker.prototype._deleteForks error');
      return cb(err);
    }
    if (!instances) {
      log.info(self.logData, 'DeleteInstanceWorker.prototype._deleteForks no instances');
      return cb();
    }
    instances.forEach(function(fork) {
      rabbitMQ.deleteInstance({
        instanceId: fork._id,
        instanceName: fork.name,
        sessionUserId: sessionUserId
      });
    });
    cb();
  }.bind(this));
};

DeleteInstanceWorker.prototype._handleError = function(err, cb) {
  log.error(put({
    err: err
  }, this.logData), 'delete-instance final error');
  cb();
};
