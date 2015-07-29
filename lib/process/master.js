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
  return ~index ?
    arr.splice(index, 1):
    [];
};


module.exports = Master;

/**
 * master process
 * @class
 */
function Master (numWorkers) {
  // state
  this.workers = [];
  this.dyingWorkers = {};
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
  this.monitorWorkers();
}

/* Monitoring and Logging */

/**
 * report worker count to datadog on monitor interval
 */
Master.prototype.monitorWorkers = function () {
  setInterval(this.reportWorkerCount.bind(this), process.env.MONITOR_INTERVAL);
};
/**
 * report worker count to datadog
 */
Master.prototype.reportWorkerCount = function () {
  console.log('api.worker_count', this.workers.length, this.workers.map(require('101/pluck')('id')));
  console.log('api.dying_worker_count', Object.keys(this.dyingWorkers).length, Object.keys(this.dyingWorkers));
  dogstatsd.gauge('api.worker_count', this.workers.length, 1);
  dogstatsd.gauge('api.dying_worker_count', Object.keys(this.dyingWorkers).length, 1);
};
/**
 * log worker event
 */
Master.prototype.logWorkerEvent = curry(function (evt, worker) {
  log.info({
    worker: worker.id
  }, 'CLUSTER: worker ' + evt);
  console.log('CLUSTER: worker ' + evt, worker.id);
});

/* Managing workers */

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
 * kill worker and move it to 'dyingWorkers'
 */
Master.prototype.killWorker = function (worker, signal) {
  signal = signal || 1;
  this.removeWorker(worker);
  this.dyingWorkers[worker.id] = worker;
  worker.process.kill(signal);
  worker.killTimer = setTimeout(
    this.handleWorkerKillTimeout.bind(this, worker),
    process.env.WORKER_KILL_TIMEOUT
  );
};
/**
 * remove worker from workers
 */
Master.prototype.removeWorker = function (worker) {
  var equalsWorkerId = compose(
    equals(worker.id),
    pluck('id')
  );
  return remove(this.workers, equalsWorkerId);
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
    this.softKillOldestWorker.bind(this),
    WORKER_LIFE_INTERVAL
  );
};
/**
 * stop oldest worker
 */
Master.prototype.softKillOldestWorker = function () {
  var worker = this.workers[0]; // kill worker in first position
  if (worker) {
    this.logWorkerEvent('kill by interval', worker);
    // create a replacement up front just in case the
    // worker takes a long time to exit.
    this.createWorker();
    worker.dontCreateReplacement = true;
    this.killWorker(worker, 'SIGINT');
  }
};

/* Event Handlers */

/**
 * remove worker (from workers) and create a new one
 */
Master.prototype.handleWorkerExit = function (worker) {
  this.logWorkerEvent('exit', worker);
  if (worker.killTimer) {
    clearTimeout(worker.killTimer);
  }
  if (!worker.dontCreateReplacement) {
    this.createWorker();
  }
  delete this.dyingWorkers[worker.id];
};
/**
 * worker killed by interval took too long to exit
 * so we should send it a hard kill signal
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