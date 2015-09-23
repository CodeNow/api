/**
 * Instance service performs more complex actions related to the instances.
 * The service interacts not only with DB models but with other systems like
 * job queue.
 * @module lib/models/services/instance-service
 */

'use strict';

var Instance = require('models/mongo/instance');
var rabbitMQ = require('models/rabbitmq');

var logger = require('middlewares/logger')(__filename);
var log = logger.log;

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
    // do nothing if parameters are missing
    if (!instanceId || !userId || !repo || !branch) {
      return cb();
    }
    Instance.findForkedInstances(repo, branch, function (err, instances) {
      if (err) {
        log.error({
          tx: true, err: err
        }, 'InstanceService.prototype.deleteForkedInstancesByRepoAndBranch');
        return cb(err);
      }
      if (instances) {
        var instancesToDelete = instances.filter(function (inst) {
          return inst.id !== instanceId;
        });
        instancesToDelete.forEach(function (inst) {
          rabbitMQ.deleteInstance({
            instanceId: inst.id,
            instanceName: inst.name,
            sessionUserId: userId
          });
        });
      }
      cb();
    });
  };
