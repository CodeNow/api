'use strict';

var numCPUs = require('os').cpus().length;
var ClusterManager = require('cluster-man');
var cluster = require('cluster');
var log = require('middlewares/logger')(__filename).log;
var manager = new ClusterManager({
  // Worker processes execute this on process start:
  worker: function () {
    // leave require in here
    require('./app').start();
  },

  // Master process executes this when you call `manager.start()`:
  master: function () {
    // ...
    //
    process.on('SIGINT', handleStopSignal.bind(null, 'SIGINT'));
    process.on('SIGTERM', handleStopSignal.bind(null, 'SIGTERM'));
    function handleStopSignal (signal) {
      console.log(signal);
      console.log(signal);
      console.log(signal);
      setInterval(function () {
        console.log('WORKERs',
          require('101/values')(cluster.workers)
            .map(require('101/pluck')('state'))
        );
      }, 10* 1000);
    }
  },

  // number of workers to fork:
  numWorkers: process.env.NUM_WORKERS || numCPUs,

  // Tell it not to kill the master process on an un-handled error
  // (sometimes useful, not recommended)
  killOnError: false,

  // Perform some action before the master process exits due to an error
  beforeExit: function(err, done) {
    log.fatal({
      err: err
    }, 'master process uncaughtException');
    done();
  }
});

// Start the cluster!
manager.start();