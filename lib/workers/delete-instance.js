/**
 * Delete instance in the worker. Should be robust (retriable on failure)
 * @module lib/workers/delete-instance
 */
'use strict';

require('loadenv')();
var Boom = require('dat-middleware').Boom;
var async = require('async');
var domain = require('domain');
var error = require('error');
var put = require('101/put');
var util = require('util');

var BaseWorker = require('workers/base-worker');
var Docker = require('models/apis/docker');
var Hosts = require('models/redis/hosts');
var Sauron = require('models/apis/sauron');
var User = require('models/mongo/user');
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
        messenger.emitInstanceDelete.bind(messenger, instance)
      ], function (err) {
        if (err) {
          return self._handleError(err, done);
        }
        log.trace(self.logData, 'delete-instance final success');
        done();
      });
    });
};

DeleteInstanceWorker.prototype._handleError = function (err, cb) {
  log.error(put({
    err: err
  }, this.logData), 'delete-instance final error');
  cb();
};
