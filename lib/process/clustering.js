'use strict';
var cluster = require('cluster');

var error = require('error');
var log = require('logger').log;
var Master = require('process/master');

module.exports = function (app) {
  if (cluster.isMaster) {
    if (!process.env.clustering) {
      // clustering is disabled: only create 1 worker
      new Master(1); // 1 worker
    }
    else {
      new Master();
    }
  } else {
    // worker: start app
    app.start(function(err) {
      if (err) {
        error.log(err);
        log.fatal({
          err: err
        }, 'error starting app in worker');
      }
    });
  }
};