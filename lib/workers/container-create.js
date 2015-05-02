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
var debug = require('debug')('api:worker:container-create');
var keypather = require('keypather')();
var Runnable = require('models/apis/runnable');
var runnable = new Runnable({}, {});

module.exports.worker = worker;

/**
 * Task is to update instance document w/ container
 * information and notify frontend container created
 */
function worker (data, done) {
  debug('job recieved: "container-create"');
  var labels = keypather.get(data, 'inspectData.Config.Labels');
  debug('container labels', labels);
  // TODO error handling
  runnable.workerContainerCreate({
    json: data
  }, done);
}
