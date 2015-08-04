'use strict';
require('loadenv')();

if (process.env.NEW_RELIC_LICENSE_KEY) {
  require('newrelic');
}
var cluster = require('cluster');
var log = require('middlewares/logger')(__filename).log;
var noop = require('101/noop');

function Api () {}

Api.prototype.start = function (cb) {
  cb = cb || noop;
  if (process.env.ENABLE_CLUSTERING && cluster.isMaster) {
    // leave require in here.
    var Master = require('process/master');
    var master = this.taskManager = new Master();
    master.start(function (err) {
      if (err) {
        log.fatal({err:err}, 'master failed to start');
        return cb(err);
      }
      log.info('master started');
      cb();
    });
  }
  else {
    // leave require in here.
    var Worker = require('process/worker');
    var worker = this.taskManager = new Worker();
    worker.start(function (err) {
      if (err) {
        log.fatal({err:err}, 'worker failed to start');
        return cb(err);
      }
      log.info('worker started');
      cb();
    });
  }
};

Api.prototype.stop = function (cb) {
  cb = cb || noop;
  if (process.env.ENABLE_CLUSTERING) {
    this.taskManager.stop(cb);
  }
};

var api = module.exports = new Api();

if (!module.parent) { // npm start
  api.start();
}