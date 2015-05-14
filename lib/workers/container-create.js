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

module.exports.worker = worker;

function worker (data, done) {
  var runnable = new Runnable({}, {});
  debug('job recieved: "container-create"');
  var labels = keypather.get(data, 'inspectData.Config.Labels');
  debug('container labels', labels);
  //done(); <-- THIS creates ridiculous errors
  //console.log('container-create', labels);
  if (keypather.get(labels, 'type') === 'user-container') {
    runnable.workerContainerCreate({
      json: data
    }, function (/* err, res, body */) {
      // todo handle error
      //console.log('worker response', arguments);
      done();
    });
  } else {
    done();
  }
}
