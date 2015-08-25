/**
 * Create instance container in the worker. Should be robust (retriable on failure)
 * @module lib/workers/create-instance-container
 */
'use strict';

require('loadenv')();
var async = require('async');
var domain = require('domain');
var error = require('error');
var put = require('101/put');
var uuid = require('node-uuid');
var keypather = require('keypather')();
var Docker = require('models/apis/docker');
var Runnable = require('models/apis/runnable');
var dogstatsd = require('models/datadog');
var ContextVersion = require('models/mongo/context-version');
var User = require('models/mongo/user');
var Instance = require('models/mongo/instance');
var Boom = require('dat-middleware').Boom;
var logger = require('middlewares/logger')(__filename);
var log = logger.log;

var ddName = 'api.worker.create-instance-container.';

function CreateInstanceContainerWorker () {
  log.info('CreateInstanceContainerWorker constructor');
}

module.exports = CreateInstanceContainerWorker;

module.exports.worker = function (data, done) {
  log.info({
    tx: true,
    data: data
  }, 'CreateInstanceContainerWorker module.exports.worker');
  var workerDomain = domain.create();
  workerDomain.on('error', function (err) {
    log.fatal({
      tx: true,
      data: data,
      err: err
    }, 'create-instance-container domain error');
    error.workerErrorHandler(err, data);
    // ack job and clear to prevent loop
    done();
  });
  workerDomain.run(function () {
    log.info(put({
      tx: true
    }, data), 'hermes.subscribe create-instance-container-worker start');
    var worker = new CreateInstanceContainerWorker();
    worker.handle(data, done);
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
CreateInstanceContainerWorker.prototype.handle = function (data, done) {
  var self = this;
  var start = new Date();
  var jobUuid = uuid.v4();
  var attemptCount = 1;
  var ld = put({
    tx: true,
    elapsedTimeSeconds: start,
    uuid: jobUuid
  }, data);
  log.info(ld, 'createInstanceContainerWorker start');

  async.retry({
    times: process.env.WORKER_CREATE_INSTANCE_CONTAINER_NUMBER_RETRY_ATTEMPTS
  }, function (cb) {
    ContextVersion.findById(data.cvId, function (err, contextVersion) {
      if (err || !contextVersion) {
        err = err || Boom.notFound('ContextVersion not found');
        log.error(put({ err: err }, ld), 'create-instance-container job error');
        // no need to retry. application error
        return cb();
      }
      var docker = new Docker(data.dockerHost);
      docker.createUserContainer(contextVersion, {
        Env: data.instanceEnvs,
        Labels: data.labels
      }, function (err) {
        var duration = (new Date() - start) / 1000 | 0;
        if (err) {
          attemptCount++;
          log.error(put({
            err: err,
            duration: duration
          }, ld), 'create-instance-container error');
          dogstatsd.timing(ddName + 'error', new Date()-start, 1, ['error:'+err]);
          var statusCode = keypather.get(err, 'output.statusCode');
          if (statusCode === 404) {
            // no need to retry. application error
            self._handle404(contextVersion, data, err, function (err) {
              if (err) {
                log.error(put({
                  err: err,
                  duration: duration
                }, ld), 'create-instance-container _handle404 error');
              }
              cb();
            });
          } else if (statusCode === 504) {
            // timeout: we need to retry
            cb(err);
          } else {
            // some real failure. not timeout
            // no need to retry. application error
            self._handleAppError(data.instanceId, data.cvId, err, function (err) {
              if (err) {
                log.error(put({
                  err: err,
                  duration: duration
                }, ld), 'create-instance-container _handleAppError error');
              }
              cb();
            });
          }
        }
        else {
          log.info(put({ duration: duration, attemptCount: attemptCount }, ld),
            'create-instance-container job success');
          dogstatsd.timing(ddName + 'success', new Date()-start, 1, []);
          cb();
        }
      });
    });
  }, done);
};

CreateInstanceContainerWorker.prototype._handle404 = function (contextVersion, data, appError, cb) {
  this._findUserAndInstance(data.userId, data.instanceId, function (err, res) {
    if (err) {
      return cb(err);
    }
    var instance = res.instance;
    var user = res.user;
    if (!user) {
      return cb(Boom.notFound('User was not found inside create container job', data));
    }
    if (!instance) {
      return cb(Boom.notFound('Instance was not found inside create container job', data));
    }
    var docker = new Docker(data.dockerHost);
    var runnable = new Runnable({}, user);
    var deployPayload = {
      forceDock: data.dockerHost,
      json: { build: data.buildId }
    };
    async.series([
      instance.modifyContainerCreateErr.bind(instance, data.cvId, appError),
      // TODO: ideally we should do this in serate worker.
      // this can be done in the separate task/pr
      docker.pullImage.bind(docker, contextVersion.build.dockerTag),
      runnable.deployInstance.bind(runnable, instance, deployPayload)
    ], cb);
  });
};

CreateInstanceContainerWorker.prototype._handleAppError =
  function (instanceId, cvId, appError, cb) {
    Instance.findById(instanceId, function (err, instance) {
      if (err) {
        return cb(err);
      }
      if (!instance) {
        var notFound = Boom.notFound('Instance was not found inside create container job',
          { instanceId: instanceId });
        return cb(notFound);
      }
      instance.modifyContainerCreateErr(cvId, appError, cb);
    });
  };

CreateInstanceContainerWorker.prototype._findUserAndInstance = function (userId, instanceId, cb) {
  async.parallel({
    user: User.findById.bind(User, userId),
    instance: Instance.findById.bind(Instance, instanceId)
  }, cb);
};
