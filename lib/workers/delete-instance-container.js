/**
 * Delete instance container in the worker. Should be robust (retriable on failure)
 * @module lib/workers/delete-instance-container
 */
'use strict';

require('loadenv')();
var async = require('async');
var domain = require('domain');
var error = require('error');
var put = require('101/put');
var util = require('util');

var BaseWorker = require('workers/base-worker');
var Docker = require('models/apis/docker');
var Hosts = require('models/redis/hosts');
var Sauron = require('models/apis/sauron');

var logger = require('middlewares/logger')(__filename);

var log = logger.log;

function DeleteInstanceContainerWorker () {
  log.info('DeleteInstanceContainerWorker constructor');
  BaseWorker.apply(this, arguments);
}

util.inherits(DeleteInstanceContainerWorker, BaseWorker);

module.exports = DeleteInstanceContainerWorker;

module.exports.worker = function (data, done) {
  log.info({
    tx: true,
    data: data
  }, 'DeleteInstanceContainerWorker module.exports.worker');
  var workerDomain = domain.create();
  workerDomain.on('error', function (err) {
    log.fatal({
      tx: true,
      data: data,
      err: err
    }, 'delete-instance-container domain error');
    error.workerErrorHandler(err, data);
    // ack job and clear to prevent loop
    done();
  });
  workerDomain.run(function () {
    log.info(put({
      tx: true
    }, data), 'hermes.subscribe delete-instance-container-worker start');
    var worker = new DeleteInstanceContainerWorker(data);
    worker.handle(done);
  });
};


/**
 * Worker callback function, handles instance container creation
 * Invokes internal API route
 * @param {Object} data - event metadata
 * @param {Function} done - sends ACK signal to rabbitMQ
 *   to remove job from queue
 *
 * NOTE: invoked w/ callback from tests.
 *       invoked w/o callback in prod
 */
DeleteInstanceContainerWorker.prototype.handle = function (done) {
  log.info(this.logData, 'DeleteInstanceContainerWorker.prototype.handle');
  var data = this.data;
  var sauron = new Sauron(data.dockerHost);
  var hosts = new Hosts();
  var docker = new Docker(data.dockerHost);
  async.series([
    sauron.detachHostFromContainer.bind(sauron, data.networkIp, data.hostIp, data.dockerContainer),
    hosts.removeHostsForInstance.bind(hosts, data.ownerUsername,
      data.instance, data.instanceName, data.container),
    docker.stopContainer.bind(docker, data.container, true),
    docker.removeContainer.bind(docker, data.container)
  ], done);
};
