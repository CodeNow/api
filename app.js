'use strict';
require('loadenv')();

if (process.env.NEW_RELIC_LICENSE_KEY) {
  require('newrelic');
}
var cluster = require('cluster');
var log = require('middlewares/logger')(__filename).log;

if (cluster.isMaster) {
  // leave require in here.
  var Master = require('process/master');
  var master = process.env.ENABLE_CLUSTERING ?
    new Master()  :
    new Master(1) ; // disabled clustering means 1 worker
  console.log(master.numWorkers, process.env.WORKERS_PER_CPU);
  master.start(function (err) {
    if (err) {
      log.fatal({err:err}, 'master failed to start');
      throw err;
    }
    log.info('master started');
  });
} else { // cluster.isWorker
  // leave require in here.
  var Worker = require('process/worker');
  var worker = new Worker();
  worker.start(function (err) {
    if (err) {
      log.fatal({err:err}, 'worker failed to start');
      throw err;
    }
    log.info('worker started');
  });
}
