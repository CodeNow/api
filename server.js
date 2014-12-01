'use strict';
require('loadenv')();
var debug = require('debug')('server');
var error = require('error');
var ApiServer = require('server');
var apiServer = new ApiServer();
var keyGen = require('key-generator');

keyGen.go();

function startServer () {
  apiServer.start(function(err) {
    if (err) {
      debug('fatal error: api server failed to start', err);
      error.log(err);
      process.exit(1);
    }
    debug('api server stated', err);
  });
}

process.on('uncaughtException', function(err) {
  debug('stopping app due too uncaughtException:',err);
  error.log(err);
  var oldServer = apiServer;
  oldServer.stop(function() {
    debug('server stopped');
  });
  apiServer = new ApiServer();
  startServer();
});

startServer();
