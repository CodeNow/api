'use strict';
var http = require('http');
var loadenv = require('loadenv');
loadenv();
if (process.env.NEWRELIC_NAME && process.env.NEWRELIC_KEY) {
  require('newrelic');
}
var primusProxy = require('./socket/terminal-stream.js');
var buildStream = require('./socket/build-stream.js');
var logStream = require('./socket/log-stream.js');
var socketServer = require('./socket/socket-server.js');
var debug = require('debug')('runnable-api:server');
var dnsJobQueue = require('models/dns-job-queue');

function Server () {
  debug('new Server()');
  require('http').globalAgent.maxSockets = 1000;
  require('https').globalAgent.maxSockets = 1000;
  var app = require('./express-app');
  this.express = http.createServer(app);
  this.primus = socketServer.createSocketServer(this.express);
  socketServer.addHandler('build-stream', buildStream.buildStreamHandler);
  socketServer.addHandler('log-stream', logStream.logStreamHandler);
  socketServer.addHandler('terminal-stream', primusProxy.proxyStreamHandler);
  return this;
}

Server.prototype.start = function (cb) {
  debug('start');
  dnsJobQueue.start();
  this.express.listen(process.env.PORT, cb);
  return this;
};

Server.prototype.stop = function (cb) {
  debug('stop');
  dnsJobQueue.stop();
  this.express.close(cb);
  return this;
};

module.exports = Server;
