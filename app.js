'use strict';
require('loadenv')();
var error = require('error');
var ApiServer = require('server');
var apiServer = new ApiServer();
var keyGen = require('key-generator');
var events = require('models/events');
var debug = require('debug')('runnable-api');
var createCount = require('callback-count');
var Boom = require('dat-middleware').Boom;
var activeApi = require('models/redis/active-api');
var mongooseControl = require('models/mongo/mongoose-control');
var envIs = require('101/env-is');
var dogstatsd = require('models/datadog');

if (process.env.NEWRELIC_KEY) {
  require('newrelic');
}

function Api () {}

Api.prototype.start = function (cb) {
  debug('start');
  // start github ssh key generator
  keyGen.start();
  // start sending socket count
  dogstatsd.captureSocketCount();

  var count = createCount(callback);
  // connect to mongoose
  mongooseControl.start(count.inc.next);
  // start listening to events
  count.inc();
  activeApi.setAsMe(function (err) {
    if (err) { return count.next(err); }
    events.listen(count.next);
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
    // express server
    mongooseControl.stop(count.inc().next);
    events.close(count.inc().next);
    apiServer.stop(count.inc().next);
  });
};

// we are exposing here apiServer as a singletond

var api = module.exports = new Api();

if (!module.parent) { // npm start
  api.start();
}

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