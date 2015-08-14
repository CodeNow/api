/**
 * Create instance container in the worker. Should be robust (retriable on failure)
 * @module lib/workers/create-instance-container
 */
'use strict';

require('loadenv')();
var put = require('101/put');
var uuid = require('node-uuid');
var Docker = require('models/apis/docker');
var dogstatsd = require('models/datadog');
var ContextVersion = require('models/mongo/context-version');
var Boom = require('dat-middleware').Boom;
var logger = require('middlewares/logger')(__filename);
var log = logger.log;

module.exports.worker = createInstanceContainerWorker;

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
function createInstanceContainerWorker (data, done) {
  var start = new Date();
  var jobUuid = uuid.v4();
  var logData = put({
    tx: true,
    elapsedTimeSeconds: start,
    uuid: jobUuid
  }, data);
  log.info(logData, 'createInstanceContainerWorker start');
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
      log.error(put({
        err: err
      }, logData), 'create-instance-container job complete error');
      clearTimeout(timeout);
      return done();
    }
    var docker = new Docker(data.dockerHost);
    docker.createUserContainer(contextVersion, {
      Env: data.instanceEnvs,
      Labels: data.labels
    }, function (err) {
      clearTimeout(timeout);
      var duration = (new Date() - start) / 1000 | 0;
      if (err) {
        log.error(put({
          err: err,
          duration: duration
        }, logData), 'create-instance-container job complete error');
      }
      else {
        log.info(put({
          duration: duration
        }, logData), 'create-instance-container job complete success');
      }
      dogstatsd.timing('api.worker.create-instance-container', new Date()-start, 1, [
        'error:'+err,
      ]);
      done();
    });
  });
}
