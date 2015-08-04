/**
 * Manage starting a container on a dock with retry attempts
 * @module lib/workers/start-instance-container
 */
'use strict';

require('loadenv')();
var async = require('async');
var put = require('101/put');

var Docker = require('models/apis/docker');
var Hosts = require('models/redis/hosts');
var Instance = require('models/mongo/instance');
var Sauron = require('models/apis/sauron');
var User = require('models/mongo/user');
var log = require('middlewares/logger')(__filename).log;
var messenger = require('socket/messenger');

module.exports.worker = startInstanceContainerWorker;

/**
 * @param {Object} data - event metadata
 *   .containerId
 *   .host
 * @param {Function} callback (optional) - function to be invoked before
 *   done
 * @param {Function} done - sends ACK signal to rabbitMQ
 *   to remove job fro queue
 *
 * NOTE: invoked w/ callback from tests.
 *       invoked w/o callback in prod
 */
function startInstanceContainerWorker (data, callback, done) {
  var start = new Date();
  var logData = put({
    tx: true,
    elapsedTimeSeconds: start
  }, data);

  var instance;
  var user;

  var docker = new Docker(data.dockerHost);

  log.trace(logData, 'startContainerWorker');

  if (!done) {
    done = callback;
    callback = null;
  }

  async.series([
    async.parallel.bind(async, [
      findInstance,
      findUser,
    ]),
    startContainer,
    inspectContainerAndUpdate,
    attachContainerToNetwork
  ], function (err) {
    if (err) {
      log.error(put({
        err: err
      }, logData), 'startInstanceContainerWorker final error');
      if (instance) {
        messenger.emitInstanceUpdate(instance, 'start-error');
      }
    }
    else {
      log.trace(logData, 'startInstanceContainerWorker final success');
      messenger.emitInstanceUpdate(instance, 'start');
    }
    done();
  });

  /**
   * find instance and verify specified container is still attached.
   *   - if container is no longer attached (instance not found), worker is done
   * @param {Function} findInstanceCb
   */
  function findInstance (findInstanceCb) {
    log.trace(logData, 'startInstanceContainerWorker findInstance');
    Instance.findOne({
      '_id': data.instanceId,
      'container.dockerContainer': data.dockerContainer
    }, function (err, result) {
      if (err) {
        log.trace(put({
          err: err
        }, logData), 'startInstanceContainerWorker instance findById error');
      }
      else if(!result) {
        log.error(logData, 'startInstanceContainerWorker instance not found');
        return findInstanceCb(new Error('user not found'));
      }
      instance = result;
      findInstanceCb.apply(this, arguments);
    });
  }

  /**
   * find user, used to join primus org room
   * @param {Function} findUserCb
   */
  function findUser (findUserCb) {
    log.trace(logData, 'startInstanceContainerWorker findUser');
    User.findByGithubId(data.sessionUserGithubId, function (err, result) {
      if (err) {
        log.error(put({
          err: err
        }, logData), 'findUser findByGithubId error');
      }
      else if(!result) {
       log.error(logData, 'findUser findByGithubId not found');
        return findUserCb(new Error('user not found'));
      }
      user = result;
      findUserCb.apply(this, arguments);
    });
  }

  /**
   * Attempt to start container X times.
   *  - after failure or success, remove "starting" state in mongo
   */
  function startContainer (startContainerCb) {
    log.trace(logData, 'startInstanceContainerWorker startContainer');
    var attemptCount = 1;
    async.retry({
      times: parseInt(process.env.WORKER_START_CONTAINER_NUMBER_RETRY_ATTEMPTS)
    }, function (cb) {
      docker.startUserContainer(data.containerId, data.ownerGithubId, function (err) {
        if (err) {
          log.error(put({
            err: err,
            attemptCount: attemptCount
          }, logData), 'startInstanceContainerWorker start container attempt failure');
          attemptCount++;
        }
        else {
          log.trace(put({
            attemptCount: attemptCount
          }, logData), 'startInstanceContainerWorker start container success');
        }
        cb.apply(this, arguments);
      });
    }, function (err) {
      if (err) {
        log.error(put({
          err: err,
          attemptCount: attemptCount
        }, logData), 'startInstanceContainerWorker start container final failure');
      }
      else {
        log.trace(put({
          attemptCount: attemptCount
        }, logData), 'startInstanceContainerWorker start container success');
      }
      instance.removeStartingStoppingStates(err, function (err2) {
        if (err2) {
          log.error(put({
            err: err2,
            attemptCount: attemptCount
          }, logData), 'startInstanceContainerWorker '+
            'start container final removeStartingStoppingStates failure');
        }
        startContainerCb(err);
      });
    });
  }

  /**
   * Attempt to inspect container X times.
   *   - If operation fails X times, update database w/ inspect error
   *   - If success, update database w/ container inspect
   * @param {Function} inspectContainerAndUpdateCb
   */
  function inspectContainerAndUpdate (inspectContainerAndUpdateCb) {
    log.trace(logData, 'startInstanceContainerWorker inspectContainer');
    var attemptCount = 1;
    async.retry({
      times: parseInt(process.env.WORKER_INSPECT_CONTAINER_NUMBER_RETRY_ATTEMPTS)
    }, function (cb) {
      docker.inspectContainer(data.containerId, function (err, result) {
        if (err) {
          log.error(put({
            err: err,
            attemptCount: attemptCount
          }, logData), 'startInstanceContainerWorker inspectContainer error');
          attemptCount++;
          return cb(err);
        }
        log.trace(put({
          inspect: result
        }, logData), 'startInstanceContainerWorker inspectContainer success');
        cb(null, result);
      });
    }, function (err, result) {
      if (err) {
        log.error(put({
          err: err,
          attemptCount: attemptCount
        }, logData), 'startInstanceContainerWorker inspectContainer async.retry final error');
        instance.modifyContainerInspectErr(data.containerId, err, function (err2) {
          if (err2) {
            log.error(put({
              err: err2
            }, logData), 'startInstanceContainerWorker inspectContainer '+
              'async.retry final error updateInspectError error');
          }
          return inspectContainerAndUpdateCb(err);
        });
      }
      else {
        log.trace(put({
          attemptCount: attemptCount
        }, logData), 'startInstanceContainerWorker inspectContainer async.retry final success');
        instance.modifyContainerInspect(data.containerId, result, function (err2) {
          if (err2) {
            log.error(put({
              err: err2
            }, logData), 'startInstanceContainerWorker inspectContainer '+
              'async.retry final error updateInspectError error');
          }
          return inspectContainerAndUpdateCb(err);
        });
      }
    });
  }

  /**
   * Attach host to container and upsert into weave
   * @param {Function} attachContainerToNetworkCb
   */
  function attachContainerToNetwork (attachContainerToNetworkCb) {
    log.trace(logData, 'startInstanceContainerWorker attachContainerToNetwork');
    var sauron = new Sauron(data.dockerHost);
    var hosts = new Hosts();
    async.series([
      sauron.attachHostToContainer.bind(sauron, data.networkIp, data.hostIp, data.dockerContainer),
      hosts.upsertHostsForInstance.bind(hosts, data.ownerUsername, instance)
    ], function (err) {
      if (err) {
        log.error(put({
          err: err
        }, logData), 'startInstanceContainerWorker attachContainerToNetwork async.series error');
      }
      else {
        log.trace(logData, 'startInstanceContainerWorker attachContainerToNetwork '+
                  'async.series success');
      }
      attachContainerToNetworkCb(err);
    });
  }
}
