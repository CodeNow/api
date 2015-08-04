/**
 * Manage starting a container on a dock with retry attempts
 * @module lib/workers/start-instance-container
 */
'use strict';

require('loadenv')();
var async = require('async');
var put = require('101/put');

var Docker = require('models/apis/docker');
var Instance = require('models/mongo/instance');
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

  var containerInspectData;
  var instance;
  var user;

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
    inspectContainer,
    updateInstance
  ], done);

  /**
   *
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
        return cb(new Error('user not found'));
      }
      instance = result;
      findInstanceCb.apply(this, arguments);
    });
  }

  /**
   *
   */
  function findUser (findUserCb) {
    log.trace(logData, 'startInstanceContainerWorker findUser');
    User.findByGithubId(data.ownerGithubId, function (err, result) {
      if (err) {
        log.error(put({
          err: err
        }, logData), 'findUser findByGithubId error');
      }
      else if(!result) {
       log.error(logData, 'findUser findByGithubId not found');
        return cb(new Error('user not found'));
      }
      user = result;
      findUserCb.apply(this, arguments);
    });
  }

  /**
   *
   */
  function startContainer (startContainerCb) {
    log.trace(logData, 'startInstanceContainerWorker startContainer');
    var attemptCount = 1;
    var docker = new Docker(data.dockerHost);
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
      startContainerCb.apply(this, arguments);
    });
  }

  /**
   *
   */
  function inspectContainer (cb) {
    log.trace(logData, 'startInstanceContainerWorker inspectContainer')
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
        log.error(put({
          err: err
        }, logData), 'startInstanceContainerWorker inspectContainer error');
        containerInspectData = result;
        cb();
      });
    }, cb);
  }

  /**
   *
   */
  function updateInstance (updateInstanceCb) {
    // find instance, user
    Instance.findOneAndUpdate({
      '_id': data.instanceId,
      'container.dockerContainer': data.dockerContainer
    }, {
      '$set': {
        'container.inspect': containerInspectData
      }
    }, function (err, result) {
      if (err) {
      }
      else if (!result) {
        return updateInstanceCb(new Error('instance not found'));
      }
      updateInstanceCb.apply(this, arguments);
    });
  }

  /**
   *
   */
  function attachContainerToNetwork (cb) {
  }

  /**
   *
   */
  function notifyFrontend (cb) {
  }




  //messenger.emitInstanceUpdate( instance starting )
/*
  instances.model.inspectAndUpdate(),
  sauron.create('instance.container.dockerHost'),
    sauron.model.attachHostToContainer(
      'instance.network.networkIp',
      'instance.network.hostIp',
      'instance.container.dockerContainer'),
    // upsert new hosts (overwrites old ones)
    hosts.create(),
    hosts.model.upsertHostsForInstance('ownerUsername', 'instance'))

  docker.startContainer(data.containerId)
*/


}
