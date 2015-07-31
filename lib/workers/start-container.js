/**
 * Manage starting a container on a dock with retry attempts
 * @module lib/workers/start-container
 */
'use strict';

require('loadenv')();

var log = require('middlewares/logger')(__filename).log;

module.exports.worker = startContainerWorker;

/**
 * @param {Object} data - event metadata
 * @param {Function} callback (optional) - function to be invoked before
 *   done
 * @param {Function} done - sends ACK signal to rabbitMQ
 *   to remove job fro queue
 *
 * NOTE: invoked w/ callback from tests.
 *       invoked w/o callback in prod
 */
function startContainerWorker (data, callback, done) {
  if (!done) {
    done = callback;
    callback = null;
  }
  var start = new Date();
  // room to notify
  // host / containerId
}
