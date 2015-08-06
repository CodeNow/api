'use strict';
var apiServer = require('server');
var error = require('error');
var log = require('middlewares/logger')(__filename).log;
var dogstatsd = require('models/datadog');
var error = require('error');
var keyGen = require('key-generator');
var keypather = require('keypather')();
var logger = require('middlewares/logger')(__filename);
var mongooseControl = require('models/mongo/mongoose-control');
var log = logger.log;
var createCount = require('callback-count');
var redisClient = require('models/redis');
var pubsub = require('models/redis/pubsub');
var bindAll = require('101/bind-all');
var cluster = require('cluster');
var activeApi = require('models/redis/active-api');
var error = require('error');
var events = require('models/events');

var noop = require('101/noop');
var envIs = require('101/env-is');
if (envIs('test')) {
  process.exit = noop;
}

module.exports = Worker;

/**
 * worker process
 * @class
 */
function Worker () {
  log.info('create worker manager');
  // bind methods to context (for event handlers)
  bindAll(this, [
    'handleUncaughtException',
    'handleStopSignal'
  ]);
}

/**
 * start worker tasks
 * @param {function} cb callback
 */
Worker.prototype.start = function (cb) {
  log.info('start worker tasks');
  var count = createCount(5, cb);
  // start sending socket count
  dogstatsd.monitorStart(count.next);
  // connect to mongoose
  mongooseControl.start(count.next);
  // express server start
  apiServer.start(count.next);
  // start ssh key generator
  keyGen.start(count.next);
  // listen to docker events
  activeApi.setAsMe(function (err) {
    if (err) { return count.next(err); }
    events.listen();
    count.next();
  });
  this.listenToProcess();
};
/**
 * stop worker tasks
 * @param {function} cb callback
*/
Worker.prototype.stop = function (cb) {
  log.info('stop worker tasks');
  var self = this;
  // start sending socket count
  apiServer.stop(function (err) {
    if (err) {
      handleStop(err);
      handleStop = error.log.bind(error); // prevent multiple callbacks
    }
    var count = createCount(handleStop);
    // stop datadog monitoring
    dogstatsd.monitorStop(count.inc().next);
    // stop ssh key generator
    keyGen.stop(count.inc().next);
    // disconnect from mongoose
    mongooseControl.stop(count.inc().next);
    // FIXME: this breaks the tests
    if (!envIs('test')) {
      // disconnect from redis
      redisClient.quit();
      redisClient.on('end', count.inc().next);
      pubsub.quit();
      pubsub.on('end', count.inc().inc().next); // calls twice
    }
    // stop listening to docker die events
    events.close(count.inc().next);
    // remove all listeners
    self.stopListeningToProcess();
  });
  function handleStop (err) {
    var KILL_TIMEOUT = process.env.KILL_TIMEOUT;
    if (err && KILL_TIMEOUT) {
      setTimeout(function () {
        process.exit(1);
      }, KILL_TIMEOUT);
    }
    cb(err);
  }
};
/**
 * listen to process exceptions and cluster events
 */
Worker.prototype.listenToProcess = function () {
  process.on('uncaughtException', this.handleUncaughtException);
  process.on('SIGINT', this.handleStopSignal);
  process.on('SIGTERM', this.handleStopSignal);
};
/**
 * listen to process exceptions and cluster events
 */
Worker.prototype.stopListeningToProcess = function () {
  process.removeAllListeners('uncaughtException');
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGTERM');
};
/**
 * handle uncaught exceptions in worker process
 * @param {function} cb callback
 */
Worker.prototype.handleUncaughtException = function (err) {
  var self = this;
  log.fatal({
    err: err
  }, 'stopping app due too uncaught exception');
  this.stop(function (stopErr) {
    if (stopErr) {
      log.fatal({ err: stopErr }, 'error stopping worker');
      return;
    }
    log.info('worker stopped successfully');
    self.waitForCleanExit();
  });
};
/**
 * SIGINT event handler
 */
Worker.prototype.handleStopSignal = function () {
  var workerId = keypather.get(cluster, 'worker.id');
  log.info('STOP SIGNAL RECIEVED', { worker: workerId });
  var self = this;
  this.stop(function (err) {
    if (err) {
      log.error({ err: err }, 'STOP SIGNAL: worker stop failed');
      return;
    }
    log.info('STOP SIGNAL: stop succeeded, wait ' +
      'some time to ensure the worker process has drained');
    self.waitForCleanExit();
  });
};

Worker.prototype.waitForCleanExit = function () {
  var poller = setInterval(function () {
    if (process._getActiveHandles().length < 2) {
      // there are 2 active handles
      // 1 is the interval and 1 is the clustered process
      clearInterval(poller);
      log.info('worker process exited cleanly');
      process.exit(); // clean exit
    }
  }, 500);
};
