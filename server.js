'use strict';
require('loadenv')();
var debug = require('debug')('server');
var cluster = require('cluster');
var numCPUs = require('os').cpus().length;
var error = require('error');
// used to store servers so we can close them correctly.
var serverStore = {};


if (process.env.NEWRELIC_KEY) {
  require('newrelic');
}

var createWorker = function() {
  var worker = cluster.fork();
  worker.process.on('uncaughtException', function(err) {
    error.log(err);
    if(serverStore[process.pid] &&
      serverStore[process.pid].stop) {
      serverStore[process.pid].stop(function() {
        delete serverStore[process.pid];
        worker.process.exit(1);
      });
    }
  });
  return worker;
};

var attachLogs = function(clusters) {
  clusters.on('fork', function(worker) {
    debug(new Date() + 'CLUSTER: fork worker' + worker.id);
  });
  clusters.on('listening', function(worker, address) {
    debug(new Date() + 'CLUSTER: listening worker' + worker.id,
      'address', address.address + ':' + address.port);
  });
  clusters.on('exit', function(worker, code, signal) {
    if (code !== 0) {
      error.log(new Error('CLUSTER: exit worker' + worker.id + 'code' + code + 'signal' + signal));
    }
    debug(new Date() + 'CLUSTER: exit worker' + worker.id + 'code' + code + 'signal' + signal);
    createWorker();
  });
  clusters.on('online', function(worker) {
    debug(new Date() + 'CLUSTER: online worker' + worker.id);
  });
  clusters.on('disconnect', function(worker) {
    debug(new Date() + 'CLUSTER: disconnected worker' + worker.id + 'killing now');
    worker.kill();
  });
};

var masterHandleException = function() {
  process.on('uncaughtException', function(err) {
    error.log(err);
  });
};

if (cluster.isMaster) {
  attachLogs(cluster);
  masterHandleException();
  // Fork workers. one per cpu
  numCPUs = 1; // HARDCODE TO 1 FOR NO TODO: FIXME: HACK:
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
      error.log(err);
      process.exit(1);
    }
  });
}

