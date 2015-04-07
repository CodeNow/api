/**
 * Creates instance of http server, starts/stops
 * listening to requests
 * @module lib/server
 */
'use strict';

var createCounter = require('callback-count');
var debug = require('debug')('runnable-api:server');
var fs = require('fs');
var http = require('http');
var https = require('https');

var SocketServer = require('socket/socket-server.js');

module.exports = Server;

if (process.env.NEWRELIC_NAME && process.env.NEWRELIC_KEY) {
  require('newrelic');
}

/**
 * @class
 * @return this
 */
function Server () {
  debug('new Server()');
  require('http').globalAgent.maxSockets = 1000;
  require('https').globalAgent.maxSockets = 1000;
  this.app = require('./express-app');
  this.express = http.createServer(this.app);
  this.socketServer = new SocketServer(this.express);
  return this;
}

/**
 * Begin listening for incoming HTTP requests
 * @param {Function} cb
 */
Server.prototype.start = function (cb) {
  debug('start', process.env.PORT);
  var counter = createCounter(cb);
  var options = {
    ca: fs.readFileSync('lib/certs/server.csr'),
    cert: fs.readFileSync('lib/certs/server.crt'),
    key: fs.readFileSync('lib/certs/server.key')
  };
  this.express.listen(process.env.PORT, counter.inc().next);
  if (process.env.HTTPS) {
    https.createServer(options, this.app).listen(process.env.HTTPS_PORT || 443, counter.inc().next);
  }
  return this;
};

/**
 * Cease listening for incoming HTTP requests
 * @param {Function} cb
 */
Server.prototype.stop = function (cb) {
  debug('stop');
  this.express.close(cb);
  return this;
};
