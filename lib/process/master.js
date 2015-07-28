'use strict';
var cluster = require('cluster');
var numCPUs = require('os').cpus().length;

var curry = require('101/curry');
var compose = require('101/compose');
var equals = require('101/equals');
var findIndex = require('101/find-index');
var pluck = require('101/pluck');

var dogstatsd = require('models/datadog');
var log = require('middlewares/logger')(__filename).log;
var workerFactory = require('process/worker-factory');
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
  this.workerKillTimeouts = {};
  // attach events handlers
  process.on('uncaughtException',
    this.handleUncaughtException.bind(this));
  cluster.on('fork',      this.logWorkerEvent('fork'));
  cluster.on('online',    this.logWorkerEvent('online'));
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
    workerFactory.create()
  );
};
/**
 * destroy workers after some time, memory leak patch
 */
Master.prototype.cycleWorkers = function () {
  var WORKER_LIFE_INTERVAL = process.env.WORKER_LIFE_INTERVAL;
  if (!process.env.ENABLE_CLUSTERING || !WORKER_LIFE_INTERVAL) {
    return false;
  }
  return setInterval(
    this.stopOldestWorker.bind(this),
    WORKER_LIFE_INTERVAL
  );
};
/**
 * stop oldest worker
 */
Master.prototype.stopOldestWorker = function () {
  var worker = this.workers[0]; // kill worker in first position
  if (worker) {
    this.logWorkerEvent('kill by interval', worker);
    this.workerKillTimeouts[worker.id] = setTimeout(
      this.handleWorkerKillTimeout.bind(this, worker),
      process.env.WORKER_KILL_TIMEOUT
    );
    worker.process.kill('SIGINT');
  }
};
/**
 * remove worker (from workers) and create a new one
 */
Master.prototype.handleWorkerExit = function (worker) {
  this.logWorkerEvent('exit', worker);
  clearTimeout(this.workerKillTimeouts[worker.id]);
  var equalsWorkerId = compose(
    equals(worker.id),
    pluck('id')
  );
  remove(this.workers, equalsWorkerId);
  this.createWorker();
};
/**
 * remove worker (from workers) and create a new one
 */
Master.prototype.handleWorkerKillTimeout = function (worker) {
  this.logWorkerEvent('kill timed out', worker);
  // rollbar tracking
  dogstatsd.increment('api.worker_kill_timedout', 1);
  worker.process.kill(1);
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