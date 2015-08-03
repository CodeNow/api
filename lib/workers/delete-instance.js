/**
 * Delete instance in the worker. Should be robust (retriable on failure)
 * @module lib/workers/delete-instance
 */
'use strict';

require('loadenv')();
var keypather = require('keypather')();
var Runnable = require('models/apis/runnable');
var dogstatsd = require('models/datadog');
var logger = require('middlewares/logger')(__filename);

var log = logger.log;

module.exports.worker = deleteInstanceWorker;

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
function deleteInstanceWorker (data, callback, done) {
  if (!done) {
    done = callback;
    callback = null;
  }
  var start = new Date();
  var runnable = new Runnable({}, {});
  var labels = {}; //keypather.get(data, 'inspectData.Config.Labels');
  log.info({
    labels: labels
  }, 'deleteInstanceWorker start');
  var timeoutDuration = 1000*60*3; // 3 minutes
  var timeout = setTimeout(function () {
    log.error({
      data: data,
      timeoutDuration: timeoutDuration
    }, 'delete-instance job timeout');
  }, timeoutDuration); // 2 minutes
  // runnable.workerOnInstanceContainerCreate({
  //   json: data
  // }, function (err/*, res, body*/) {
  //   if (callback) {
  //     callback.apply(this, arguments);
  //   }
    // clearTimeout(timeout);
    // if (err) {
    //   log.error({
    //     err: err,
    //     data: data
    //   }, 'delete-instance job complete error');
    // }
    // else {
      log.info({
        labels: labels
      }, 'delete-instance job complete success');
    // }
    dogstatsd.timing('api.worker.delete-instance', new Date()-start, 1, [
      'error:'+err,
      'type:'+labels.type,
    ]);
    done();
  // });
}
