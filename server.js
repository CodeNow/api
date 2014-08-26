'use strict';
require('loadenv')();
var debug = require('debug')('server');
var error = require('error');
var ApiServer = require('server');
var apiServer = new ApiServer();
require('key-generator').go();

if (process.env.NEWRELIC_KEY) {
  require('newrelic');
}

apiServer.start(function(err) {
  if (err) {
    error.log('API SERVER FAILED TO START', err);
    process.exit(1);
  }
});

process.on('uncaughtException', function(err) {
  error.log(err);
  apiServer.stop(function() {
    process.exit(1);
  })
});
