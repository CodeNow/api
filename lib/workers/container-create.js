/**
 * Respond to container-create event from Docker
 * Job created from docker-listener running on a dock
 *  - start the container
 *  - update instance model
 *  - start container
 *  - notifications
 *    - primus org-room broadcast
 * @module lib/workers/container-create
 */
'use strict';

require('loadenv')();
var keypather = require('keypather')();
var debug = require('debug')('api:worker:container-create');
var log = require('logger').child({ module: 'workers:container-create' }, true);

var Runnable = require('models/apis/runnable');
var dogstatsd = require('models/datadog');

module.exports.worker = containerCreateWorker;

/**
 * Worker callback function, handles container-create
 * Invokes internal API route
 * @param {Object} data - event metadata
 * @param {Function} done - sends ACK signal to rabbitMQ
 *   to remove job fro queue
 */
function containerCreateWorker (data, done) {
  var start = new Date();
  var runnable = new Runnable({}, {});
  var labels = keypather.get(data, 'inspectData.Config.Labels');
  debug('job recieved: "container-create"');
  debug('container labels', labels);
  log.info(labels, 'job recieved: "container-create"');
  runnable.workerContainerCreate({
    json: data
  }, function (err/*, res, body */) {
    if (err) {
      log.error({
        err: err,
        labels: labels
      });
    }
    else {
      log.info(labels, 'job complete: "container-create"');
    }
    dogstatsd.timing('api.worker.container-create', new Date()-start, 1, [
      'error:'+err,
      'type:'+labels.type,
    ]);
    done();
  });
}
