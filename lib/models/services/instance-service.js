/**
 * Instance service performs more complex actions related to the instances.
 * The service interacts not only with DB models but with other systems like
 * job queue.
 * @module lib/models/services/instance-service
 */

'use strict';

var Boom = require('dat-middleware').Boom;
var put = require('101/put');
var Instance = require('models/mongo/instance');
var log = require('middlewares/logger')(__filename).log;
var rabbitMQ = require('models/rabbitmq');

function InstanceService () {}

module.exports = InstanceService;

/**
 * Find all forked instances that has specific main repo and branch deployed and
 * create `delete-instance` job for each of the found instances.
 * @param instanceId - this instance is the original. Shouldn't be deleted
 * @param userId - user that should perform instance deletion action
 * @param repo - repo name used for the instances search
 * @param branch - branch name used for the instances search
 * @param cb - standard Node.js callback
 */
InstanceService.prototype.deleteForkedInstancesByRepoAndBranch =
  function (instanceId, userId, repo, branch, cb) {
    var logData = {
      tx: true,
      instanceId: instanceId,
      userId: userId,
      repo: repo,
      branch: branch
    };
    log.info(logData, 'InstanceService.prototype.deleteForkedInstancesByRepoAndBranch');
    // do nothing if parameters are missing
    if (!instanceId || !userId || !repo || !branch) {
      log.warn(logData, 'InstanceService.prototype.deleteForkedInstancesByRepoAndBranch quit');
      return cb();
    }
    Instance.findForkedInstances(repo, branch, function (err, instances) {
      if (err) {
        log.error(put({ err: err }, logData),
          'InstanceService.prototype.deleteForkedInstancesByRepoAndBranch');
        return cb(err);
      }
      if (instances) {
        var instancesToDelete = instances.filter(function (inst) {
          return inst._id.toString() !== instanceId.toString();
        });
        instancesToDelete.forEach(function (inst) {
          rabbitMQ.deleteInstance({
            instanceId: inst._id,
            instanceName: inst.name,
            sessionUserId: userId
          });
        });
      }
      cb();
    });
  };

/**
 * Creates a 'deploy-worker' job in the queue based off of either an instanceId or a buildId
 * @param instanceId - this instance should be deployed
 * @param buildId - this is the build that should be deployed
 * @param userId - user that should perform instance deletion action
 * @param ownerUsername - the owners username
 * @param forceDock - (OPTIONAL) force a deploy to happen on this dock address
 * @param cb - standard Node.js callback
 */

/* jshint maxcomplexity:8 */
InstanceService.prototype.deploy = function (parameters, cb) {
  var instanceId = parameters.instanceId;
  var buildId = parameters.buildId;
  var userId = parameters.userId;
  var ownerUsername = parameters.ownerUsername;
  var forceDock = parameters.forceDock;

  if (forceDock === 'body.forceDock' || 'forceDock') {
    forceDock = undefined;
  }
  var logData = {
    tx: true,
    instanceId: instanceId,
    buildId: buildId,
    userId: userId,
    ownerUsername: ownerUsername,
    forceDock: forceDock
  };
  log.info(logData, 'InstanceService.prototype.deploy');
  // do nothing if parameters are missing
  if ((!instanceId && !buildId) || !userId || !ownerUsername) {
    log.warn(logData, 'InstanceService.prototype.deploy quit');
    return cb();
  }
  rabbitMQ.deployInstance({
    instanceId: instanceId,
    buildId: buildId,
    forceDock: forceDock,
    ownerUsername: ownerUsername,
    sessionUserGithubId: userId
  });
  cb();
};


/**
 * Modifies instance container IP. Invalidates charon cache
 * @param instance - instance that should be updates
 * @param containerId - docker container id
 * @param containerIp - docker container IP
 * @param cb - standard Node.js callback
 */
InstanceService.prototype.modifyContainerIp = function (instance, containerId, containerIp, cb) {
  var logData = {
    tx: true,
    instanceId: instance._id,
    containerId: containerId,
    containerIp: containerIp
  };
  log.info(logData, 'InstanceService.prototype.modifyContainerIp');
  // Any time the inspect data is to be updated we need to ensure the old
  // DNS entries for this container have been invalidated on the charon cache.
  instance.invalidateContainerDNS();

  var query = {
    _id: instance._id,
    'container.dockerContainer': containerId
  };
  // Note: inspect may have keys that contain dots.
  //  Mongo does not support dotted keys, so we remove them.
  var $set = {
    'network.hostIp': containerIp,
    'container.inspect.NetworkSettings.IPAddress': containerIp
  };
  Instance.findOneAndUpdate(query, { $set: $set }, function (err, instance) {
    if (err) {
      log.error(put({
        err: err
      }, logData), 'InstanceService.prototype.modifyContainerIp err');
      return cb(err);
    }
    if (!instance) { // changed or deleted
      log.error(logData,
        'InstanceService.prototype.modifyContainerIp error instance not found');
      return cb(Boom.conflict('Container IP was not updated, instance\'s container has changed'));
    }
    log.trace(logData, 'InstanceSchema.methods.modifyContainerInspect success');
    cb(null, instance);
  });
};
