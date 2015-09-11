/**
 * Create instance container in the worker. Should be robust (retriable on failure)
 * @module lib/workers/create-instance-container
 */
'use strict';

require('loadenv')();
var Boom = require('dat-middleware').Boom;
var async = require('async');
var domain = require('domain');
var error = require('error');
var keypather = require('keypather')();
var put = require('101/put');
var util = require('util');

var BaseWorker = require('workers/base-worker');
var ContextVersion = require('models/mongo/context-version');
var Docker = require('models/apis/docker');
var Instance = require('models/mongo/instance');
var logger = require('middlewares/logger')(__filename);

var log = logger.log;

function CreateInstanceContainerWorker () {
  log.info('CreateInstanceContainerWorker constructor');
  BaseWorker.apply(this, arguments);
}

util.inherits(CreateInstanceContainerWorker, BaseWorker);

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
    var worker = new CreateInstanceContainerWorker(data);
    worker.handle(done);
  });
};


/**
 * Worker callback function, handles instance container creation
 * Invokes internal API route
 * @param {Function} done - sends ACK signal to rabbitMQ
 *   to remove job from queue
 *
 * NOTE: invoked w/ callback from tests.
 *       invoked w/o callback in prod
 */
CreateInstanceContainerWorker.prototype.handle = function (done) {
  log.info(this.logData, 'CreateInstanceContainerWorker.prototype.handle');
  var data = this.data;
  var self = this;
  var attemptCount = 1;
  async.retry({
    times: process.env.WORKER_CREATE_INSTANCE_CONTAINER_NUMBER_RETRY_ATTEMPTS
  }, function (cb) {
    ContextVersion.findById(data.cvId, function (err, contextVersion) {
      if (err || !contextVersion) {
        err = err || Boom.notFound('ContextVersion not found');
        log.error(put({
          err: err
        }, self.logData), 'create-instance-container failed to find context version');
        // no need to retry. application error
        return cb();
      }
      var docker = new Docker(data.dockerHost);
      docker.createUserContainer(contextVersion, {
        Env: data.instanceEnvs,
        Labels: data.labels
      }, function (err0) {
        if (err0) {
          attemptCount++;
          log.error(put({
            err: err0
          }, self.logData), 'create-instance-container error');
          var statusCode = keypather.get(err, 'output.statusCode');
          if (statusCode === 404) {
            // no need to retry. application error
            self._handle404(contextVersion, data, function (err2) {
              if (err2) {
                log.error(put({
                  err: err2
                }, self.logData), 'create-instance-container _handle404 error');
                return self._handleAppError(data.instanceId, data.cvId, err, cb);
              }
              cb();
            });
          } else if (statusCode === 504) {
            // timeout: we need to retry
            cb(err);
          } else {
            // some real failure. not timeout
            // no need to retry. application error
            self._handleAppError(data.instanceId, data.cvId, err, function (err3) {
              if (err3) {
                log.error(put({ err: err3 }, self.logData),
                  'create-instance-container _handleAppError error');
              }
              cb();
            });
          }
        }
        else {
          log.info(put({ attemptCount: attemptCount }, self.logData),
            'create-instance-container job success');
          cb();
        }
      });
    });
  }, done);
};

CreateInstanceContainerWorker.prototype._handle404 = function (contextVersion, data, cb) {
  log.info(put({
    dockerTag: contextVersion.build.dockerTag
  }, this.logData), 'CreateInstanceContainerWorker.prototype._handle404');
  var docker = new Docker(data.dockerHost);
  async.series([
    // TODO: ideally we should do this in separate worker.
    // this can be done in the separate task/pr
    docker.pullImage.bind(docker, contextVersion.build.dockerTag),
    docker.createUserContainer.bind(docker, {
      Env: data.instanceEnvs,
      Labels: data.labels
    })
  ], cb);
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
