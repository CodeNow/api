/**
 * Index file of API, program begins here
 * @module app
 */
'use strict';
require('loadenv')();

var cluster = require('cluster');
var createCount = require('callback-count');

var ApiServer = require('server');
var dogstatsd = require('models/datadog');
var envIs = require('101/env-is');
var error = require('error');
var keyGen = require('key-generator');
var logger = require('middlewares/logger')(__filename);
var mongooseControl = require('models/mongo/mongoose-control');
var noop = require('101/noop');
var redisClient = require('models/redis');
var redisPubSub = require('models/redis/pubsub');

var log = logger.log;

// Report environment here (as opposed to in loadenv)
if (envIs('production', 'staging')) {
  log.trace({
    env: process.env,
  }, 'env');
}

if (!envIs('test')) {
  console.log('ENVIRONMENT CONFIG', process.env.NODE_ENV, process.env);
}

// express server, handles web HTTP requests
var apiServer = new ApiServer();

/**
 * @class
 */
function Api () {
  // bind `this` so it can be used directly as event handler
  this._handleStopSignal = this._handleStopSignal.bind(this);
}

/**
 * - Listen to incoming HTTP requests
 * - Initialize datadog system monitoring
 * - Set self as "active api"
 * - Listen to all events (docker events from docks)
 * - Generate GitHub ssh keys
 * @param {Function} cb
 */
Api.prototype.start = function (cb) {
  cb = cb || error.logIfErr;
  var self = this;
  var count = createCount(callback);
  log.trace('start');
  // start github ssh key generator
  keyGen.start(count.inc().next);
  // start sending socket count
  dogstatsd.monitorStart();
  // connect to mongoose
  mongooseControl.start(count.inc().next);
  // express server start
  apiServer.start(count.inc().next);
  // all started callback
  function callback (err) {
    if (err) {
      log.error({
        err: err
      }, 'fatal error: API failed to start');
      error.log(err);
      if (cb) {
        cb(err);
      }
      else {
        process.exit(1);
      }
      return;
    }
    log.trace('API started');
    console.log('API started');
    self.listenToSignals();
    cb();
  }
};

/**
 * Stop listening to requests and drain all current requests gracefully
 * @param {Function} cb
 */
Api.prototype.stop = function (cb) {
  log.trace('stop');
  cb = cb || error.logIfErr;
  var self = this;

  var count = createCount(closeDbConnections);
  // stop github ssh key generator
  keyGen.stop(count.inc().next);
  // stop sending socket count
  dogstatsd.monitorStop();
  // express server
  apiServer.stop(count.inc().next);

  function closeDbConnections (err) {
    if (!err) {
      // so far the stop was successful
      // finally disconnect from he databases
      var dbCount = createCount(cb);
      // FIXME: redis clients cannot be reconnected once they are quit; this breaks the tests.
      if (!envIs('test')) {
        // disconnect from redis
        redisClient.quit();
        redisClient.on('end', dbCount.inc().next);
        redisPubSub.quit();
        redisPubSub.on('end', dbCount.inc().inc().next); // calls twice
      }
      var next = dbCount.inc().next;
      mongooseControl.stop(function (err) {
        if (err) { return next(err); }
        self.stopListeningToSignals();
        next();
      });
      return;
    }
    cb(err);
  }
};

/**
 * listen to process SIGINT
 */
Api.prototype.listenToSignals = function () {
  process.on('SIGINT', this._handleStopSignal);
  process.on('SIGTERM', this._handleStopSignal);
};

/**
 * stop listening to process SIGINT
 */
Api.prototype.stopListeningToSignals = function () {
  process.removeListener('SIGINT', this._handleStopSignal);
  process.removeListener('SIGTERM', this._handleStopSignal);
};

/**
 * SIGINT event handler
 */
Api.prototype._handleStopSignal = function () {
  log.info('STOP SIGNAL: recieved');
  var self = this;
  process.removeAllListeners('uncaughtException');
  this.stop(function (err) {
    if (err) {
      log.error({
        err: err
      }, 'STOP SIGNAL: stop failed');
      return;
    }
    log.info('STOP SIGNAL: stop succeeded, process should exit gracefully');
    if (cluster.isWorker) {
      // workers need to be exited manually
      self._waitForActiveHandlesAndExit();
    }
  });
};

/**
 * wait for active handles to reach 2 or less
 */
Api.prototype._waitForActiveHandlesAndExit = function (cb) {
  cb = cb || noop;
  var poller = setInterval(function () {
    var handles = process._getActiveHandles();
    log.info({ count: handles.length, items: handles }, 'Active handles');
    if (process._getActiveHandles().length <= 2) {
      // there are 2 active handles
      // 1 is the interval and 1 is the clustered process
      clearInterval(poller);
      log.info('Worker process exited gracefully');
      process.exit(); // clean exit
    }
  }, 1000);
};


/**
 * Returns PrimusSocket constructor function that can be used for
 * primus Client instantiation.
 * @return {Function} - PrimusSocket class
 */
Api.prototype.getPrimusSocket = function () {
  return apiServer.socketServer.primus.Socket;
};

// we are exposing here apiServer as a singletond
var api = module.exports = new Api();

if (!module.parent) { // npm start
  api.start();
}

// should not occur in practice, using domains to catch errors
process.on('uncaughtException', function(err) {
  log.fatal({
    err: err
  }, 'stopping app due too uncaughtException');

  // hack to force loggly to release buffer
  for(var i = 0; i<process.env.BUNYAN_BATCH_LOG_COUNT; i++) {
    log.info('---');
  }

  error.log(err);
  var oldApi = api;
  oldApi.stop(function() {
    log.trace('API stopped');
    api = new ApiServer();
    api.start();
  });
});
