/**
 * Manage starting a container on a dock with retry attempts
 * @module lib/workers/start-instance-container
 */
'use strict';

require('loadenv')();
var async = require('async');
var noop = require('101/noop');
var pick = require('101/pick');
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
  var docker = new Docker(data.dockerHost);
  var instance;
  var user;
  log.info(logData, 'startInstanceContainerWorker');

  if (!done) {
    done = callback;
    callback = noop;
  }

  async.series([
    findInstance,
    findUser,
    startContainer,
    inspectContainerAndUpdate,
    attachContainerToNetwork
  ], function (err) {
    if (err) {
      log.warn(put({
        err: err
      }, logData), 'startInstanceContainerWorker final error');
      if (instance) {
        updateFrontend('start-error');
      }
    }
    else {
      log.info(logData, 'startInstanceContainerWorker final success');
      updateFrontend('start');
    }
    callback.apply(this, arguments); // for unit tests
    done();
  });

  /**
   * Emit primus event to frontend notifying of start success or failure
   * @param {String} eventName
   */
  function updateFrontend (eventName) {
    log.info(put({
      eventName: eventName
    }, logData), 'updateFrontend');
    Instance.findById(data.instanceId, function (err, instance) {
      if (err) {
        log.error(put({
          err: err
        }, logData), 'updateFrontend fetchInstance error');
        return;
      }
      else if (!instance) {
        log.error(logData, 'updateFrontend fetchInstance instance not found');
        return;
      }
      instance.populateModels(function (err) {
        if (err) {
          log.error(put({
            err: err
          }, logData), 'updateFrontend instance.populateModels error');
        }
        else {
          instance.populateOwnerAndCreatedBy(user, function (err, instance) {
            if (err) {
              log.error(put({
                err: err
              }, logData), 'updateFrontend instance.populateOwnerAndCreatedBy error');
              return;
            }
            log.trace(logData, 'updateFrontend instance.populateOwnerAndCreatedBy success');
            messenger.emitInstanceUpdate(instance, eventName);
          });
        }
      });
    });
  }

  /**
   * find instance and verify specified container is still attached.
   *   - if container is no longer attached (instance not found), worker is done
   * @param {Function} findInstanceCb
   */
  function findInstance (findInstanceCb) {
    log.info(logData, 'startInstanceContainerWorker findInstance');
    Instance.findOne({
      '_id': data.instanceId,
      'container.dockerContainer': data.dockerContainer
    }, function (err, result) {
      if (err) {
        log.warn(put({
          err: err
        }, logData), 'startInstanceContainerWorker instance findOne error');
        return findInstanceCb(err);
      }
      else if (!result) {
        log.warn(logData, 'startInstanceContainerWorker instance not found');
        return findInstanceCb(new Error('instance not found'));
      }
      log.trace(put({
        instance: pick(result, ['_id', 'name', 'owner']),
        container: pick(result.container, ['dockerContainer', 'dockerHost'])
      }, logData), 'startInstanceContainerWorker instance findOne success');
      instance = result;
      findInstanceCb.apply(this, arguments);
    });
  }

  /**
   * find user, used to join primus org room
   * @param {Function} findUserCb
   */
  function findUser (findUserCb) {
    log.info(logData, 'startInstanceContainerWorker findUser');
    User.findByGithubId(data.sessionUserGithubId, function (err, result) {
      if (err) {
        log.warn(put({
          err: err
        }, logData), 'findUser findByGithubId error');
        return findUserCb(err);
      }
      else if(!result) {
        log.warn(logData, 'findUser findByGithubId not found');
        return findUserCb(new Error('user not found'));
      }
      log.trace(put({
        user: result.toJSON()
      }, logData), 'findUser findByGithubId success');
      user = result;
      findUserCb.apply(this, arguments);
    });
  }

  /**
   * Attempt to start container X times.
   *  - after failure or success, remove "starting" state in mongo
   */
  function startContainer (startContainerCb) {
    log.info(logData, 'startInstanceContainerWorker startContainer');
    var attemptCount = 1;
    async.retry({
      times: parseInt(process.env.WORKER_START_CONTAINER_NUMBER_RETRY_ATTEMPTS)
    }, function (cb) {
      docker.startUserContainer(data.dockerContainer, data.sessionUserGithubId, function (err) {
        if (err) {
          log.warn(put({
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
        log.warn(put({
          err: err,
          attemptCount: attemptCount
        }, logData), 'startInstanceContainerWorker start container final failure');
      }
      else {
        log.trace(put({
          attemptCount: attemptCount
        }, logData), 'startInstanceContainerWorker start container final success');
      }
      instance.removeStartingStoppingStates(function (err2) {
        if (err2) {
          log.warn(put({
            err: err2,
            attemptCount: attemptCount
          }, logData), 'startInstanceContainerWorker '+
            'start container final removeStartingStoppingStates failure');
        }
        else {
          log.trace(logData, 'startInstanceContainerWorker '+
                    'start container final removeStartingStoppingStates success');
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
    log.info(logData, 'startInstanceContainerWorker inspectContainerAndUpdate');
    var attemptCount = 1;
    async.retry({
      times: parseInt(process.env.WORKER_INSPECT_CONTAINER_NUMBER_RETRY_ATTEMPTS)
    }, function (cb) {
      docker.inspectContainer(data.dockerContainer, function (err, result) {
        if (err) {
          log.warn(put({
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
        log.warn(put({
          err: err,
          attemptCount: attemptCount
        }, logData), 'startInstanceContainerWorker inspectContainer async.retry final error');
        instance.modifyContainerInspectErr(data.dockerContainer, err, function (err2) {
          if (err2) {
            log.warn(put({
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
        instance.modifyContainerInspect(data.dockerContainer, result, function (err2, _instance) {
          if (err2) {
            log.warn(put({
              err: err2
            }, logData), 'startInstanceContainerWorker inspectContainer '+
              'async.retry final error updateInspectError error');
          }
          // updated instance w/ ports on container inspect for remaining network attach operations
          instance.container = _instance.container;
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
    log.info(logData, 'startInstanceContainerWorker attachContainerToNetwork');
    var sauron = new Sauron(data.dockerHost);
    var hosts = new Hosts();
    async.series([
      sauron.attachHostToContainer.bind(sauron, data.networkIp, data.hostIp, data.dockerContainer),
      hosts.upsertHostsForInstance.bind(hosts, data.ownerUsername, instance)
    ], function (err) {
      if (err) {
        log.warn(put({
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
