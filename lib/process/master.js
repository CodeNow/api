'use strict';
var cluster = require('cluster');
var numCPUs = require('os').cpus().length;

var curry = require('101/curry');
var compose = require('101/compose');
var equals = require('101/equals');
var findIndex = require('101/find-index');
var pluck = require('101/pluck');

var error = require('error');
var log = require('middlewares/logger')(__filename).log;
var Worker = require('process/worker');
var remove = function (arr, fn) {
  var index = findIndex(arr, fn);
  if (~index) {
    return arr.splice(index, 1);
  }
};

module.exports = Master;

/**
 * master process
 * @class
 */
function Master (numWorkers) {
  // state
  this.workers = [];
  this.numWorkers = numWorkers || (numCPUs * process.env.WORKERS_PER_CPU);
  // attach events handlers
  process.on('uncaughtException',
    this.handleUncaughtException.bind(this));
  cluster.on('fork',      this.logWorkerEvent('fork'));
  cluster.on('online',    this.handleWorkerOnline.bind(this));
  cluster.on('listening', this.logWorkerEvent('listening'));
  cluster.on('exit',      this.handleWorkerExit.bind(this));
  cluster.on('disconnect', this.logWorkerEvent('disconnect'));
  // actions
  this.forkWorkers();
  this.cycleWorkers();
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
 * destroy workers after some time, memory leak patch
 */
Master.prototype.cycleWorkers = function () {
  var worker = this.workers[0]; // kill worker in first position
  setInterval(function () {
    if (worker) {
      log.info({
        worker: worker.id
      }, 'CLUSTER: worker kill (by interval)');
      worker.kill('SIGINT');
    }
  }, process.env.WORKER_LIFE_INTERVAL);
};
/**
 * remove worker (from workers) and create a new one
 */
Master.prototype.handleWorkerExit = function (worker) {
  this.logWorkerEvent('exit', worker);
  var equalsWorkerId = compose(
    equals(worker.id),
    pluck('id')
  );
  remove(this.workers, equalsWorkerId);
  this.createWorker();
};
/**
 * handle master process uncaught exceptions
 * @param {error} err uncaught error
 */
Master.prototype.handleUncaughtException = function (err) {
  log.fatal({
    err: err
  }, 'stopping app due too uncaught exception');
};

module.exports = Master;