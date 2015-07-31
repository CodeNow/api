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
var remove = function (arr, fn) {
  var index = findIndex(arr, fn);
  return ~index ?
    arr.splice(index, 1):
    [];
};
var createCount = require('callback-count');
var bindAll = require('101/bind-all');


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
  // bind methods to context (for event handlers)
  bindAll(this);
}

/* Start and Stop */

/**
 * start tasks in master process
 * @param  {Function} cb callback
 */
Master.prototype.start = function (cb) {
  this.listenToProcessEvents();
  this.listenToSignals();
  this.forkWorkers();
  this.cycleInterval = this.cycleWorkers();
  this.monitorInterval = this.monitorWorkers();
  cb();
};
/**
 * stop tasks in master process
 * @param  {Function} cb callback
 */
Master.prototype.stop = function (cb) {
  var self = this;
  var count = createCount(this.workers.length, handleStop);
  clearInterval(this.cycleInterval);
  clearInterval(this.monitorInterval);
  // kill all the workers
  cluster.on('exit', function (/* worker */) {
    // must be wrapped bc of args
    count.next();
  });
  this.workers.forEach(function (worker) {
    worker.dontCreateReplacement = true;
    self.killWorker(worker, 'SIGINT');
  });
  function handleStop (err) {
    // remove all listeners
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    cluster.removeAllListeners('fork');
    cluster.removeAllListeners('online');
    cluster.removeAllListeners('exit');
    cluster.removeAllListeners('disconnect');
    if (err) {
      setTimeout(function () {
        process.exit(1);
      }, process.env.KILL_TIMEOUT);
    }
    cb(err);
  }
};

/* Listen to events */
/**
 * listen to process exceptions and cluster events
 */
Master.prototype.listenToProcessEvents = function () {
  process.on('uncaughtException', this.handleUncaughtException);
  cluster.on('fork',       this.logWorkerEvent('fork'));
  cluster.on('online',     this.logWorkerEvent('online'));
  cluster.on('exit',       this.handleWorkerExit);
  cluster.on('disconnect', this.logWorkerEvent('disconnect'));
};
/**
 * listen to process SIGINT
 */
Master.prototype.listenToSignals = function () {
  process.on('SIGINT', this.handleStopSignal);
  process.on('SIGTERM', this.handleStopSignal);
};

/* Monitoring and Logging */

/**
 * report worker count to datadog on monitor interval
 */
Master.prototype.monitorWorkers = function () {
  return setInterval(this.reportWorkerCount, process.env.MONITOR_INTERVAL);
};
/**
 * report worker count to datadog
 */
Master.prototype.reportWorkerCount = function () {
  log.info([
    'api.worker_count',
    this.workers.length,
    this.workers.map(require('101/pluck')('id'))
  ].join(' '));
  log.info([
    'api.dying_worker_count',
    Object.keys(this.dyingWorkers).length,
    Object.keys(this.dyingWorkers)
  ].join(' '));
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
  var worker = cluster.fork();
  this.workers.push(worker);
  return worker;
};
/**
 * kill worker and move it to 'dyingWorkers'
 */
Master.prototype.killWorker = function (worker, signal) {
  signal = signal || 'SIGKILL';
  this.removeWorker(worker);
  this.dyingWorkers[worker.id] = worker;
  worker.process.kill(signal);
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
  if (!WORKER_LIFE_INTERVAL) {
    return false;
  }
  return setInterval(
    this.softKillOldestWorker,
    WORKER_LIFE_INTERVAL
  );
};
/**
 * stop oldest worker
 */
Master.prototype.softKillOldestWorker = function () {
  var worker = this.workers[0]; // kill worker in first position
  var self = this;
  if (worker) {
    this.logWorkerEvent('kill by interval', worker);
    // create a replacement up front just in case the
    // worker takes a long time to exit.
    this.createWorker().once('online', function () {
      worker.dontCreateReplacement = true;
      self.killWorker(worker, 'SIGINT');
    });
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
 * handle master process uncaught exceptions
 * @param {error} err uncaught error
 */
Master.prototype.handleUncaughtException = function (err) {
  log.fatal({
    err: err
  }, 'stopping app due too uncaught exception');
  this.stop(function (stopErr) {
    if (stopErr) {
      return log.fatal({ err: stopErr }, 'error stopping master');
    }
    log.info('master stopped successfully');
  });
};
/**
 * SIGINT event handler
 */
Master.prototype.handleStopSignal = function () {
  var self = this;
  this.stop(function (err) {
    if (err) {
      log.error({
        err: err
      }, 'STOP SIGNAL: stop failed');
      return;
    }
    log.info('STOP SIGNAL: stop succeeded, wait' +
      'some time to ensure the process has drained');
    self.ensureCleanExit();
  });
};

Master.prototype.ensureCleanExit = function () {
  var poller = setInterval(function () {
    if (process._getActiveHandles().length === 3) {
      // there are 2 active handles
      // 1 is the interval and 1 is the clustered process
      clearInterval(poller);
      log.info('worker process exited cleanly');
      process.exit(); // clean exit
    }
  }, 1000);
};

module.exports = Master;