/**
 * Delete instance in the worker. Should be robust (retriable on failure)
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

function DeleteInstanceWorker () {
  log.info('DeleteInstanceWorker constructor');
  BaseWorker.apply(this, arguments);
}

util.inherits(DeleteInstanceWorker, BaseWorker);

module.exports = DeleteInstanceWorker;

module.exports.worker = function (data, done) {
  log.info({
    tx: true,
    data: data
  }, 'DeleteInstanceWorker module.exports.worker');
  var workerDomain = domain.create();
  workerDomain.on('error', function (err) {
    log.fatal({
      tx: true,
      data: data,
      err: err
    }, 'delete-instance domain error');
    error.workerErrorHandler(err, data);
    // ack job and clear to prevent loop
    done();
  });
  workerDomain.run(function () {
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
DeleteInstanceWorker.prototype.handle = function (done) {
  log.info(this.logData, 'DeleteInstanceWorker.prototype.handle');
  var self = this;
  var data = this.data;
  this._findInstance({_id: data.instanceId}, function (err, instance) {
      if (err) {
        // app error, we finished with this job
        return self._handleError(err, done);
      }

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
      async.series([
        instance.removeSelfFromGraph.bind(instance),
        instance.remove.bind(instance),
        rabbitMQ.deleteInstanceContainer.bind(rabbitMQ, deleteContainerTask),
        messenger.emitInstanceDelete.bind(messenger, instance),
        self._deleteForks.bind(self, instance, data.sessionUserId)
      ], function (err) {
        if (err) {
          return self._handleError(err, done);
        }
        log.trace(self.logData, 'delete-instance final success');
        done();
      });
    });
};

DeleteInstanceWorker.prototype._deleteForks = function (instance, sessionUserId, cb) {
  log.trace(this.logData, 'DeleteInstanceWorker.prototype._deleteForks');
  if (instance.masterPod !== true) {
    return cb();
  }
  Instance.findInstancesByParent(instance.shortHash, function (err, instances) {
    if (err) { return cb(err); }
    if (!instances) { return cb(null); }
    instances.forEach(function (fork) {
      rabbitMQ.deleteInstance({instanceId: fork.id, sessionUserId: sessionUserId});
    });
    cb();
  }.bind(this));
};

DeleteInstanceWorker.prototype._handleError = function (err, cb) {
  log.error(put({
    err: err
  }, this.logData), 'delete-instance final error');
  cb();
};
