'use strict';
require('loadenv')();
var error = require('error');
var ApiServer = require('server');
var apiServer = new ApiServer();
var keyGen = require('key-generator');
var events = require('models/events');
var debug = require('debug')('runnable-api');

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

function Api () {}

Api.prototype.start = function () {
  debug('start');
  // start github ssh key generator
  keyGen.start();
  // start listening to events
  events.listen();
  // express server start
  apiServer.start(function(err) {
    if (err) {
      debug('fatal error: API failed to start', err);
      error.log(err);
      process.exit(1);
    }
    debug('API started', err);
  });
};
Api.prototype.stop = function () {
  debug('stop');
  // stop github ssh key generator
  keyGen.stop();
  // start listening to events
  events.clean();
  // express server
  apiServer.stop(function(err) {
    if (err) {
      debug('fatal error: API failed to stop', err);
      error.log(err);
      setTimeout(function () {
        process.exit(1);
      }, 5000);
    }
    // server stopped successfully (and everything else should be done)
    process.exit(0);
  });
};

// we are exposing here apiServer as a singleton
var api = new Api();
api.start();

module.exports = api;


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