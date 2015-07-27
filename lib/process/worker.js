'use strict';
var cluster = require('cluster');

var error = require('error');
var log = require('middlewares/logger')(__filename).log;

module.exports = Worker;

/**
 * worker process
 * @class
 */
function Worker () {
  var worker = this.worker = cluster.fork();
  log.info('CLUSTER: create new worker', worker.id);
  worker.process.on('uncaughtException',
    this.handleUncaughtException.bind(this));
}
/**
 * handle worker process uncaught exceptions
 * @param {error} err uncaught error
 */
Worker.prototype.handleUncaughtException = function(err) {
  error.log(err);
  log.fatal({
    err: err
  }, 'stopping worker due too uncaught exception');
  this.worker.process.exit(1);
};
