/**
 * Respond to dock-unhealthy event from docker-listener
 *  - get running containers on dock
 *  - redeploy those containers
 * @module lib/workers/on-dock-removed
 */
'use strict';
require('loadenv')();
var async = require('async');
var Instance = require('models/mongo/instance');
var logger = require('middlewares/logger')(__filename);
var log = logger.log;
var Runnable = require('runnable');
var put = require('101/put');
var domain = require('domain');
var error = require('error');

module.exports = OnDockUnhealthyWorker;

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
    }, data), 'hermes.subscribe on-dock-removed start');
    var worker = new OnDockUnhealthyWorker();
    worker.handle(data, done);
  });
};

function OnDockUnhealthyWorker () {
  log.info('OnDockUnhealthyWorker constructor');
  this.runnableClient = new Runnable(process.env.FULL_API_DOMAIN, {
    requestDefaults: {
      headers: {
        'user-agent': 'worker-on-dock-removed'
      },
    }
  });
}

/**
 * main handler for docker unhealthy event
 * should redeploy all containers on unhealthy dock
 * @param {Object} data  event meta data
 * @param {Function} cb  sends ACK signal to rabbitMQ
 */
OnDockUnhealthyWorker.prototype.handle = function (data, cb) {
  var self = this;
  var dockerHost = data.host;
  var logData = {
    tx: true,
    dockerHost: dockerHost,
    data: data
  };
  log.info(logData, 'handle');
  self.runnableClient.githubLogin(process.env.HELLO_RUNNABLE_GITHUB_TOKEN, function (err) {
    if (err) {
      log.error(put({
        err: err
      }, logData), 'handle: githubLogin err');
      return cb();
    }
    Instance.findActiveInstancesByDockerHost(dockerHost, function (err, instances) {
      if (err) {
        log.error(put({
          err: err
        }, logData), 'handle: findActiveInstancesByDockerHost err');
        return cb();
      }
      // if array is empty we have no work to do
      if (instances.length <= 0) {
        log.trace(logData, 'handle: no instances on unhealthy dock');
        return cb();
      }
      self._redeployContainers(instances, cb);
    });
  });
};

/**
 * should redeploy all instances passed in
 * @param {Array}    instances       array of instances to start
 * @param {Function} cb              (err)
 */
OnDockUnhealthyWorker.prototype._redeployContainers = function (instances, cb) {
  var self = this;
  async.forEach(instances, function (instance, _cb) {
    var logData = {
      tx: true,
      instanceId: instance._id
    };
    log.info(logData, '_redeployContainers');
    var instanceModel = self.runnableClient.newInstance(instance.shortHash);
    instanceModel.redeploy({
      qs: {
        rollingUpdate: true
      }
    }, function (err) {
      // ignore errors for now
      if (err) {
        log.error(put({
          err: err
        }, logData), '_redeployContainers redeploy err');
      }
      _cb();
    });
  }, cb);
};
