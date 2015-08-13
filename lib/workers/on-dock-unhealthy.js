/**
 * Respond to dock-unhealthy event from docker-listener
 *  - get running containers on dock
 *  - redeploy those containers
 * @module lib/workers/on-dock-unhealthy
 */
'use strict';
require('loadenv')();
var async = require('async');
var Instance = require('models/mongo/instance');
var logger = require('middlewares/logger')(__filename);
var log = logger.log;
var Runnable = require('models/apis/runnable');

module.exports = Worker;

function Worker () {
  this.runnableClient = new Runnable(process.env.FULL_API_DOMAIN);
}

/**
 * main handler for docker unhealthy event
 * should redeploy all containers on unhealthy dock
 * @param {Object} data  event meta data
 * @param {Function} cb  sends ACK signal to rabbitMQ
 */
Worker.prototype.onDockUnhealthy = function (data, cb) {
  var self = this;
  var dockerHost = data.host;
  log.warn({
    tx: true,
    dockerHost: dockerHost
  }, 'onDockUnhealthy');
  self.runnableClient.githubLogin(process.env.HELLO_RUNNABLE_GITHUB_ID, function (err) {
    if (err) { return cb(err); }
    Instance.findActiveInstancesByDockerHost(dockerHost, function (err, instances) {
      if (err) { return cb(err); }
      // if array is empty we have no work to do
      if (instances.length <= 0) { return cb(); }
      self._redeployContainers(instances, cb);
    });
  });
};

/**
 * should redeploy all instances passed in
 * @param {Array}    instances       array of instances to start
 * @param {Function} cb              (err)
 */
Worker.prototype._redeployContainers = function (instances, cb) {
  var self = this;
  async.forEach(instances, function (instance, _cb) {
    log.trace({
      tx: true,
      instanceId: instance._id
    }, '_redeployContainers');
    self.runnableClient.redeployInstance(instance, {
      qs: {
        rollingUpdate: true
      }
    }, function (err) {
      // ignore errors for now
      if (err) {
        log.error({
          tx: true,
          instanceId: instance._id
        }, '_redeployContainers redeployInstance error');
      }
      _cb();
    });
  }, cb);
};
