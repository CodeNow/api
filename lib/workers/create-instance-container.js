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
  workerDomain.runnableData = BaseWorker.getRunnableData();
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
  this._baseWorkerFindContextVersion({ _id: data.cvId }, function (err, contextVersion) {
    if (err) {
      // app error, we finished with this job
      return self._handleError(err, done);
    }
    var attemptCount = 1;
    async.retry({
      times: process.env.WORKER_CREATE_INSTANCE_CONTAINER_NUMBER_RETRY_ATTEMPTS
    }, function (cb) {
      var docker = new Docker(data.dockerHost);
      docker.createUserContainer(contextVersion, {
        Env: data.instanceEnvs,
        Labels: data.labels
      }, function (err0) {
        console.log('retrying attempt');
        if (err0) {
          attemptCount++;
          log.error(put({
            err: err0
          }, self.logData), 'create-instance-container error');
          var statusCode = keypather.get(err0, 'output.statusCode');
          if (statusCode === 504) {
            // timeout: we need to retry
            return cb(err0);
          }
          if (statusCode === 404) {
            // no need to retry. application error
            self._handle404(contextVersion, function (err2) {
              if (err2) {
                log.error(put({
                  err: err2
                }, self.logData), 'create-instance-container _handle404 error');
                return self._handleAppError(data.instanceId, data.cvId, err2, cb);
              }
              cb();
            });
          } else {
            // some real failure. not timeout
            // no need to retry. application error
            self._handleAppError(data.instanceId, data.cvId, err0, function (err3) {
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
            'create-instance-container success');
          cb();
        }
      });
    }, function (err) {
      if (err) {
        return self._handleError(err, done);
      }
      log.trace(
        self.logData,
        'create-instance-container final success'
      );
      done();
    });
  });
};

CreateInstanceContainerWorker.prototype._handleError = function (err, cb) {
  log.error(put({
    err: err
  }, this.logData), 'create-instance-container final error');
  cb();
};

CreateInstanceContainerWorker.prototype._handle404 = function (contextVersion, cb) {
  log.info(put({
    dockerTag: contextVersion.build.dockerTag
  }, this.logData), 'CreateInstanceContainerWorker.prototype._handle404');
  var docker = new Docker(this.data.dockerHost);
  async.series([
    // TODO: ideally we should do this in separate worker.
    // this can be done in the separate task/pr
    docker.pullImage.bind(docker, contextVersion.build.dockerTag),
    docker.createUserContainer.bind(docker, contextVersion, {
      Env: this.data.instanceEnvs,
      Labels: this.data.labels
    })
  ], cb);
};

CreateInstanceContainerWorker.prototype._handleAppError = function (instanceId, cvId, appErr, cb) {
  var logData = put({
    instanceId: instanceId,
    cvId: cvId,
    err: appErr
  }, this.logData);
  log.info(logData,  'CreateInstanceContainerWorker.prototype._handleAppError');
  Instance.findById(instanceId, function (err, instance) {
    if (err) {
      log.error(put({
        err: err
      }, logData), '_handleAppError Instance.findById error');
      return cb(err);
    }
    if (!instance) {
      log.warn(logData, '_handleAppError Instance.findById !instance');
      var notFound = Boom.notFound('Instance was not found inside create container job',
        { instanceId: instanceId });
      return cb(notFound);
    }
    log.trace(logData, '_handleAppError Instance.findById success');
    instance.modifyContainerCreateErr(cvId, appErr, cb);
  });
};
