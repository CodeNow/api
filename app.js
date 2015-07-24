/**
 * Index file of API, program begins here
 * @module app
 */
'use strict';
require('loadenv')();

if (process.env.NEW_RELIC_LICENSE_KEY) {
  require('newrelic');
}

var Boom = require('dat-middleware').Boom;
var createCount = require('callback-count');
var envIs = require('101/env-is');

var ApiServer = require('server');
var activeApi = require('models/redis/active-api');
var dogstatsd = require('models/datadog');
var error = require('error');
var events = require('models/events');
var keyGen = require('key-generator');
var logger = require('middlewares/logger')(__filename);
var mongooseControl = require('models/mongo/mongoose-control');

var log = logger.log;

// express server, handles web HTTP requests
var apiServer = new ApiServer();

/**
 * @class
 */
function Api () {}

/**
 * - Listen to incoming HTTP requests
 * - Initialize datadog system monitoring
 * - Set self as "active api"
 * - Listen to all events (docker events from docks)
 * - Generate GitHub ssh keys
 * @param {Function} cb
 */
Api.prototype.start = function (cb) {
  var count = createCount(callback);
  log.trace('start');
  // start github ssh key generator
  keyGen.start();
  // start sending socket count
  dogstatsd.monitorStart();
  // connect to mongoose
  mongooseControl.start(count.inc().next);
  // start listening to events
  count.inc();
  activeApi.setAsMe(function (err) {
    if (err) { return count.next(err); }
    events.listen();
    count.next();
  });
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
    if (cb) {
      cb();
    }
  }
};

/**
 * Stop listening to requests and drain all current requests gracefully
 * @param {Function} cb
 */
Api.prototype.stop = function (cb) {
  log.trace('stop');
  cb = cb || error.logIfErr;
  activeApi.isMe(function (err, meIsActiveApi) {
    if (err) { return cb(err); }
    if (meIsActiveApi && !envIs('test')) {
      // if this is the active api, block stop
      return cb(Boom.create(500, 'Cannot stop current activeApi'));
    }
    var count = createCount(cb);
    // stop github ssh key generator
    keyGen.stop();
    // stop sending socket count
    dogstatsd.monitorStop();
    // express server
    mongooseControl.stop(count.inc().next);
    events.close(count.inc().next);
    apiServer.stop(count.inc().next);
  });
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
  error.log(err);
  var oldApi = api;
  oldApi.stop(function() {
    log.trace('API stopped');
  });
  api = new ApiServer();
  api.start();
});
