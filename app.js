/**
 * Index file of API, program begins here
 * @module app
 */
'use strict';
require('nodetime').profile({
  accountKey: 'ce5e71db1f93bd15b7aff013ad4b0287da1f0fcf',
  appName: 'api' + process.env.NODE_ENV
});
require("appdynamics").profile({
    controllerHostName: 'paid138.saas.appdynamics.com',
    controllerPort: 80, // If SSL, be sure to enable the next line     controllerSslEnabled: true // Optional - use if connecting to controller via SSL
    accountName: 'runnable', // Required for a controller running in multi-tenant mode
    accountAccessKey: '9y6mczvuowbx', // Required for a controller running in multi-tenant mode
    applicationName: 'api',
    tierName: 'staging',
    nodeName: 'process' // The controller will automatically append the node name with a unique number
});
require('loadenv')();
var Boom = require('dat-middleware').Boom;
var createCount = require('callback-count');
var debug = require('debug')('runnable-api');
var envIs = require('101/env-is');

var ApiServer = require('server');
var activeApi = require('models/redis/active-api');
var dogstatsd = require('models/datadog');
var error = require('error');
var events = require('models/events');
var keyGen = require('key-generator');
var mongooseControl = require('models/mongo/mongoose-control');

// express server, handles web HTTP requests
var apiServer = new ApiServer();

if (process.env.NEWRELIC_KEY) {
  require('newrelic');
}

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
  debug('start');
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
      debug('fatal error: API failed to start', err);
      error.log(err);
      if (cb) {
        cb(err);
      }
      else {
        process.exit(1);
      }
      return;
    }
    debug('API started');
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
  debug('stop');
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
  debug('stopping app due too uncaughtException:',err);
  error.log(err);
  var oldApi = api;
  oldApi.stop(function() {
    debug('API stopped');
  });
  api = new ApiServer();
  api.start();
});
