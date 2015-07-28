'use strict';
var cluster = require('cluster');

var error = require('error');
var log = require('middlewares/logger')(__filename).log;

module.exports.create = createWorker;

/**
 * worker process
 * @class
 */
function createWorker () {
  var worker = cluster.fork();
  log.info('CLUSTER: create new worker', worker.id);
  worker.process.on('uncaughtException', handleUncaughtException);
  // return node worker instance
  return worker;

  /**
   * handle worker process uncaught exceptions
   * @param {error} err uncaught error
   */
  function handleUncaughtException (worker, err) {
    error.log(err);
    log.fatal({
      err: err
    }, 'stopping worker due too uncaught exception');
    worker.process.exit(1);
  }
}
