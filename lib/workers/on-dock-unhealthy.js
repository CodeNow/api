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
var Runnable = require('runnable');

module.exports = Worker;

function Worker () {
  this.runnableClient = new Runnable(process.env.FULL_API_DOMAIN, {
  requestDefaults: {
    headers: {
      'user-agent': 'worker-on-dock-unhealthy'
    },
  },
});
}

/**
 * main handler for docker unhealthy event
 * should redeploy all containers on unhealthy dock
 * @param {Object} data  event meta data
 * @param {Function} cb  sends ACK signal to rabbitMQ
 */
Worker.prototype.handle = function (data, cb) {
  var self = this;
  var dockerHost = data.host;
  log.warn({
    tx: true,
    dockerHost: dockerHost
  }, 'onDockUnhealthy handle');
  self.runnableClient.githubLogin(process.env.HELLO_RUNNABLE_GITHUB_TOKEN, function (err) {
    if (err) {
      log.error({
        tx: true,
        err: err.message
      }, 'onDockUnhealthy githubLogin err');
      return cb();
    }
    Instance.findActiveInstancesByDockerHost(dockerHost, function (err, instances) {
      if (err) {
        log.error({
          tx: true,
          err: err.message
        }, 'onDockUnhealthy findActiveInstancesByDockerHost err');
        return cb();
      }
      // if array is empty we have no work to do
      if (instances.length <= 0) {
        log.trace({
          tx: true,
        }, 'onDockUnhealthy no instances on unhealthy dock');
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
Worker.prototype._redeployContainers = function (instances, cb) {
  var self = this;
  async.forEach(instances, function (instance, _cb) {
    log.trace({
      tx: true,
      instanceId: instance._id
    }, '_redeployContainers');
    var instanceModel = self.runnableClient.newInstance(instance.shortHash);
    instanceModel.redeploy({
      qs: {
        rollingUpdate: true
      }
    }, function (err) {
      // ignore errors for now
      if (err) {
        log.error({
          tx: true,
          instanceId: instance._id,
          err: err.message
        }, '_redeployContainers redeploy err');
      }
      _cb();
    });
  }, cb);
};
