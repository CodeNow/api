'use strict';
var ApiServer = require('server');
var error = require('error');
var log = require('middlewares/logger')(__filename).log;
var dogstatsd = require('models/datadog');
var error = require('error');
var keyGen = require('key-generator');
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

// express server, handles web HTTP requests
var apiServer = new ApiServer();

module.exports = Worker;

/**
 * worker process
 * @class
 */
function Worker () {
  log.info('create worker manager');
  // bind methods to context (for event handlers)
  bindAll(this);
}

/**
 * start worker tasks
 * @param {function} cb callback
 */
Worker.prototype.start = function (cb) {
  log.info('start worker tasks');
  var count = createCount(cb);
  // start sending socket count
  dogstatsd.monitorStart();
  // connect to mongoose
  mongooseControl.start(count.inc().next);
  // express server start
  apiServer.start(count.inc().next);
  // start ssh key generator
  keyGen.start(count.inc().next);
  // listen to docker events
  count.inc();
  activeApi.setAsMe(function (err) {
    if (err) { return count.next(err); }
    events.listen();
    count.next();
  });
  // listen to events
  this.listenToProcessEvents();
  this.listenToSignals();
};
/**
 * stop worker tasks
 * @param {function} cb callback
*/
Worker.prototype.stop = function (cb) {
  log.error('stop worker tasks');
  // start sending socket count
  apiServer.stop(function (err) {
    if (err) {
      handleStop(err);
      handleStop = error.log.bind(error); // prevent multiple callbacks
    }
    var count = createCount(5, handleStop);
    // stop datadog monitoring
    dogstatsd.monitorStop(nana);
    // stop ssh key generator
    keyGen.stop(nana);
    // disconnect from mongoose
    mongooseControl.stop(nana);
    // disconnect from redis
    redisClient.quit();
    pubsub.quit();
    redisClient.on('end', nana);
    pubsub.on('end', nana);
    function nana (err) {
      console.trace('CLUSTER GOT ONE!~');
      count.next(err);
    }
    // remove all listeners
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');

  });
  function handleStop (err) {
    if (err) {
      setTimeout(function () {
        process.exit(1);
      }, process.env.KILL_TIMEOUT);
    }
    cb(err);
  }
};
/**
 * listen to process exceptions and cluster events
 */
Worker.prototype.listenToProcessEvents = function () {
  process.on('uncaughtException', this.handleUncaughtException);
};
/**
 * listen to process SIGINT
 */
Worker.prototype.listenToSignals = function () {
  process.on('SIGINT', this.handleStopSignal);
  process.on('SIGTERM', this.handleStopSignal);
};
/**
 * handle uncaught exceptions in worker process
 * @param {function} cb callback
 */
Worker.prototype.handleUncaughtException = function (err) {
  log.fatal({
    err: err
  }, 'stopping app due too uncaught exception');
  this.stop(function (stopErr) {
    if (stopErr) {
      log.fatal({ err: stopErr }, 'error stopping worker');
      return;
    }
    log.info('worker stopped successfully');
  });
};
/**
 * SIGINT event handler
 */
Worker.prototype.handleStopSignal = function () {
  console.log('STOP SIGNAL RECIEVED', { worker: cluster.worker.id });
  var self = this;
  this.stop(function (err) {
    if (err) {
      log.error({ err: err }, 'STOP SIGNAL: worker stop failed');
      return;
    }
    log.info('STOP SIGNAL: stop succeeded, wait ' +
      'some time to ensure the worker process has drained');
    self.ensureCleanExit();
  });
};

Worker.prototype.ensureCleanExit = function () {
  var poller = setInterval(function () {
    if (process._getActiveHandles().length === 2) {
      // there are 2 active handles
      // 1 is the interval and 1 is the clustered process
      clearInterval(poller);
      log.info('worker process exited cleanly');
      process.exit(); // clean exit
    }
  }, 100);
};
