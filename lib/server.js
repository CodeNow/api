'use strict';
var http = require('http');
var loadenv = require('loadenv');
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
  var app = require('./express-app');
  this.express = http.createServer(app);
  this.socketServer = new SocketServer(this.express);
  return this;
}

Server.prototype.start = function (cb) {
  debug('start');
  this.express.listen(process.env.PORT, cb);
  return this;
};

Server.prototype.stop = function (cb) {
  debug('stop');
  this.express.close(cb);
  return this;
};


module.exports = Server;
