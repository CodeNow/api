/**
 * Create instance container in the worker. Should be robust (retriable on failure)
 * @module lib/workers/create-instance-container
 */
'use strict';

require('loadenv')();
var Docker = require('models/apis/docker');
var dogstatsd = require('models/datadog');
var ContextVersion = require('models/mongo/context-version');
var Boom = require('dat-middleware').Boom;
var logger = require('middlewares/logger')(__filename);
var log = logger.log;

module.exports.worker = createInstanceContainerWorker;

/**
 * Worker callback function, handles instance deletion
 * Invokes internal API route
 * @param {Object} data - event metadata
 * @param {Function} callback (optional) - function to be invoked before
 *   done
 * @param {Function} done - sends ACK signal to rabbitMQ
 *   to remove job from queue
 *
 * NOTE: invoked w/ callback from tests.
 *       invoked w/o callback in prod
 */
function createInstanceContainerWorker (data, callback, done) {
  if (!done) {
    done = callback;
    callback = null;
  }
  var start = new Date();
  log.info({
    data: data
  }, 'createInstanceContainerWorker start');
  var timeoutDuration = 1000*60*3; // 3 minutes
  var timeout = setTimeout(function () {
    log.error({
      data: data,
      timeoutDuration: timeoutDuration
    }, 'create-instance-container job timeout');
  }, timeoutDuration);

  ContextVersion.findById(data.cvId, function (err, contextVersion) {
    if (err || !contextVersion) {
      err = err || Boom.notFound('ContextVersion not found');
      if (callback) {
        callback(err);
      }
      log.error({
        err: err,
        data: data
      }, 'create-instance-container job complete error');
      clearTimeout(timeout);
      return done();
    }
    var docker = new Docker(data.dockerHost);
    docker.createUserContainer(contextVersion, {
      Env: data.instanceEnvs,
      Labels: data.labels
    }, function (err) {
      if (callback) {
        callback.apply(this, arguments);
      }
      clearTimeout(timeout);
      if (err) {
        log.error({
          err: err,
          data: data
        }, 'create-instance-container job complete error');
      }
      else {
        log.info({
          data: data
        }, 'create-instance-container job complete success');
      }
      dogstatsd.timing('api.worker.create-instance-container', new Date()-start, 1, [
        'error:'+err,
      ]);
      done();
    });
  });
}
