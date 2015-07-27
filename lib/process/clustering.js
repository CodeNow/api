'use strict';
var cluster = require('cluster');

var error = require('error');
var log = require('middlewares/logger')(__filename).log;
var Master = require('process/master');
var master;

module.exports = function (app) {
  if (cluster.isMaster) {
    master = !process.env.ENABLE_CLUSTERING ?
      new Master(1) : // 1 worker
      new Master()  ;
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