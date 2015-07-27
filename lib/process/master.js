'use strict';
var cluster = require('cluster');
var numCPUs = require('os').cpus().length;

var curry = require('101/curry');
var error = require('error');
var log = require('middlewares/logger')(__filename).log;
var Worker = require('process/worker');

module.exports = Master;

/**
 * master process
 * @class
 */
function Master (numWorkers) {
  var self = this;
  // state
  this.workers = [];
  this.numWorkers = numWorkers || (numCPUs * process.env.WORKERS_PER_CPU);
  // attach events handlers
  process.on('uncaughtException',
    this.handleUncaughtException.bind(this));
  cluster.on('fork',      this.logWorkerEvent('fork'));
  cluster.on('listening', this.logWorkerEvent('listening'));
  cluster.on('online',    this.logWorkerEvent('online'));
  cluster.on('exit',      this.logWorkerEvent('exit'));
  cluster.on('disconnect', function (worker) {
    self.logWorkerEvent('disconnect', worker);
    worker.kill();
  });
  // actions
  this.forkWorkers();
}
/**
 * log worker event
 */
Master.prototype.logWorkerEvent = curry(function (evt, worker) {
  log.info({
    worker: worker.id
  }, 'CLUSTER: worker ' + evt);
});
/**
 * fork worker processes per cpu
 */
Master.prototype.forkWorkers = function () {
  for (var i = 0; i < this.numWorkers; i++) {
    this.createWorker();
  }
};
/**
 * create worker and add it to the workers array
 */
Master.prototype.createWorker = function () {
  this.workers.push(
    new Worker()
  );
};
/**
 * handle master process uncaught exceptions
 * @param {error} err uncaught error
 */
Master.prototype.handleUncaughtException = function (err) {
  error.log(err);
  console.log(err.stack);
  // log.fatal({
  //   err: err
  // }, 'stopping app due too uncaught exception');
};

module.exports = Master;