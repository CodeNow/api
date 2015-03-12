'use strict';
var fs = require('fs');
var http = require('http');
var https = require('https');
var loadenv = require('loadenv');
var createCounter = require('callback-count');

loadenv();

if (process.env.NEWRELIC_NAME && process.env.NEWRELIC_KEY) {
  require('newrelic');
}
var SocketServer = require('socket/socket-server.js');
var debug = require('debug')('runnable-api:server');

function Server () {
  debug('new Server()');
  require('http').globalAgent.maxSockets = 1000;
  require('https').globalAgent.maxSockets = 1000;
  this.app = require('./express-app');
  this.express = http.createServer(this.app);
  this.socketServer = new SocketServer(this.express);
  return this;
}

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

Server.prototype.stop = function (cb) {
  debug('stop');
  this.express.close(cb);
  return this;
};


module.exports = Server;
