'use strict';
require('loadenv')();
var debug = require('debug')('server');
var cluster = require('cluster');
var path = require('path');
var rollbar = require('rollbar');
var numCPUs = require('os').cpus().length;

// used to store servers so we can close them correctly.
var serverStore = {};


if (process.env.NEWRELIC_KEY) {
  require('newrelic');
}

var createWorker = function() {
  var worker = cluster.fork();
  worker.process.on('uncaughtException', function(err) {
    console.error(new Date(), 'WORKER: uncaughtException:', err);
    rollbar.handleError(err, function () {
      // exit after all request are finished
      if(serverStore[process.pid] &&
        serverStore[process.pid].stop) {
        serverStore[process.pid].stop(function(){
          worker.process.exit(1);
        });
      }
    });
  });
  return worker;
};

var attachLogs = function(clusters) {
  clusters.on('fork', function(worker) {
    debug(new Date(), 'CLUSTER: fork worker', worker.id);
  });
  clusters.on('listening', function(worker, address) {
    debug(new Date(), 'CLUSTER: listening worker', worker.id,
      'address', address.address + ':' + address.port);
  });
  clusters.on('exit', function(worker, code, signal) {
    if (code !== 0) {
      rollbar.handleError('CLUSTER: exit worker' + worker.id + 'code' + code + 'signal' + signal);
    }
    debug(new Date(), 'CLUSTER: exit worker', worker.id, 'code', code, 'signal', signal);
    createWorker();
  });
  clusters.on('online', function(worker) {
    debug(new Date(), 'CLUSTER: online worker', worker.id);
  });
  clusters.on('disconnect', function(worker) {
    debug(new Date(), 'CLUSTER: disconnected worker', worker.id, 'killing now');
    worker.kill();
  });
};

var initExternalServices = function() {
  if (process.env.ROLLBAR_KEY) {
    rollbar.init(process.env.ROLLBAR_KEY, {
      environment: process.env.ROLLBAR_OPTIONS_ENVIRONMENT || process.env.NODE_ENV || 'development',
      branch: process.env.ROLLBAR_OPTIONS_BRANCH || 'master',
      root: path.resolve(__dirname, '..')
    });
  }
};

var masterHandleException = function() {
  process.on('uncaughtException', function(err) {
    console.error(new Date(), 'MASTER: uncaughtException:', err);
    rollbar.handleError(err, function() {
      process.exit(1);
    });
  });
};

if (cluster.isMaster) {
  attachLogs(cluster);
  initExternalServices();
  masterHandleException();
  // Fork workers. one per cpu
  for (var i = 0; i < numCPUs; i++) {
    createWorker();
  }
  // start keygen on master thread only
  require('key-generator').go();
} else {
  var ApiServer = require('index');
  var apiServer = new ApiServer();
  serverStore[process.pid] = apiServer;
  apiServer.start(function(err) {
    if (err) {
      console.error(new Date(), 'can not start server', err);
      rollbar.handleError(err, function() {
        process.exit(1);
      });
    }
  });
}

