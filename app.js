'use strict';
require('loadenv')();
var error = require('error');
var ApiServer = require('server');
var apiServer = new ApiServer();
var keyGen = require('key-generator');
var events = require('models/events');
var debug = require('debug')('runnable-api');
var uuid = require('uuid');

if (process.env.NEWRELIC_KEY) {
  require('newrelic');
}
var mongoose = require('mongoose');
var mongooseOptions = {};
if (process.env.MONGO_REPLSET_NAME) {
  mongooseOptions.replset = {
    rs_name: process.env.MONGO_REPLSET_NAME
  };
}
mongoose.connect(process.env.MONGO, mongooseOptions, function(err) {
  if (err) {
    debug('fatal error: can not connect to mongo', err);
    error.log(err);
    process.exit(1);
  }
});

function Api () {
  this.uuid = uuid();
}

Api.prototype.start = function (cb) {
  debug('start');
  // start github ssh key generator
  keyGen.start();
  // start listening to events
  events.listen();
  // express server start
  apiServer.start(function(err) {
    if (cb) { return cb(err); } // if cb exists callback with args and skip below
    if (err) {
      debug('fatal error: API failed to start', err);
      error.log(err);
      process.exit(1);
    }
    debug('API started');
    console.log('API started');
  });
};
Api.prototype.stop = function (cb) {
  debug('stop');
  // stop github ssh key generator
  keyGen.stop();
  // express server
  apiServer.stop(function(err) {
    if (cb && err) {
      return cb(err); // if cb exists callback with args and skip below
    }
    events.close(function (err) {
      if (cb) {
        return cb(err); // if cb exists callback with args and skip below
      }

      if (err) {
        debug('fatal error: API failed to stop', err);
        error.log(err);
        setTimeout(function () {
          process.exit(1);
        }, 5000);
      }
      // server stopped successfully (and everything else should be done)
      console.log('API stopped');
      process.exit(0);
    });

  });
};

// we are exposing here apiServer as a singletond

var api = new Api();

if (!module.parent) { // npm start
  api.start();
}
else { // being required as module
  module.exports = function getCurrentApi () {
    return api;
  };
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