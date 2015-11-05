'use strict';

require('loadenv')();

var ClusterManager = require('cluster-man');
var cluster = require('cluster');
var log = require('middlewares/logger')(__filename).log;
var numCPUs = require('os').cpus().length;
var pluck = require('101/pluck');
var values = require('101/values');

var manager = new ClusterManager({
  // Worker processes execute this on process start:
  worker: function () {
    // leave require in here
    require('./app').start();
  },

  // Master process executes this when you call `manager.start()`:
  master: function () {
    process.on('SIGINT', handleStopSignal.bind(null, 'SIGINT'));
    process.on('SIGTERM', handleStopSignal.bind(null, 'SIGTERM'));
    // memory leak patch
    if (process.env.WORKER_SUICIDE_INTERVAL) {
      cycleWorkers();
    }
    function handleStopSignal (signal) {
      // This handler must exist or node will "hard" exit the process
      log.info(signal + ' signal recieved');
      if (process.env.WORKER_SUICIDE_INTERVAL) {
        stopCyclingWorkers();
      }
    }
  },

  // number of workers to fork:
  numWorkers: process.env.CLUSTER_WORKERS || numCPUs,

  // Tell it not to kill the master process on an un-handled error
  // (sometimes useful, not recommended)
  killOnError: false,

  // Perform some action before the master process exits due to an error
  beforeExit: function (err, done) {
    log.fatal({
      err: err
    }, 'master process uncaughtException');
    done();
  }
});

// Start the cluster!
manager.start();

/**
 * Cycling worker logic - for memory leak patch
 */
var workerSuicideInterval;
/*
 * cycleWorkers kills and replaces workers over time - memory leak patch
 */
function cycleWorkers () {
  log.info('cycle workers to prevent memory leak');
  workerSuicideInterval = setInterval(function () {
    var worker = cluster.fork();
    // once the new worker is up and listening exit the oldest worker
    worker.once('listening', killOldestWorker);
  }, process.env.WORKER_SUICIDE_INTERVAL);
}
function killOldestWorker () {
  log.info('kill the oldest worker');
  var oldestId = Object.keys(cluster.workers).shift();
  if (oldestId) {
    var worker = cluster.workers[oldestId];
    killWorker(worker);
  }
}
function killWorker (worker) {
  log.info('kill worker: ' + worker.id);
  log.info({
    items: values(cluster.workers).map(pluck('id'))
  }, 'worker ids');
  var WORKER_KILL_TIMEOUT = process.env.WORKER_KILL_TIMEOUT;
  // send the worker process a kill signal so it can gracefully shut down
  worker.process.kill('SIGINT');
  if (WORKER_KILL_TIMEOUT) {
    var timeout = setTimeout(function () {
      // hard kill the worker if it takes too long to exit
      log.info('kill worker TIMEDOUT: ' + worker.id);
      worker.process.exit(1);
    }, WORKER_KILL_TIMEOUT);
    // don't hard kill if the worker exits
    worker.once('exit', clearTimeout.bind(null, timeout));
  }
}
/*
 * stopMemoryLeakPatch stops killing workers overtime
 */
function stopCyclingWorkers () {
  if (workerSuicideInterval) {
    clearInterval(workerSuicideInterval);
  }
}
