'use strict';
var http = require('http');
var loadenv = require('loadenv');
loadenv();
if (process.env.NEWRELIC_NAME && process.env.NEWRELIC_NAME) {
  require('newrelic');
}
var mongoose = require('mongoose');
var primusProxy = require('./socket/terminal-stream.js');
var buildStream = require('./socket/build-stream.js');
var logStream = require('./socket/log-stream.js');
var socketServer = require('./socket/socket-server.js');
var error = require('error');
var debug = require('debug')('server:server');

mongoose.connect(process.env.MONGO, function(err) {
  if (err) {
    debug('fatal error: can not connect to mongo', err);
    error(err);
    process.exit(1);
  }
});

function Server() {
  require('http').globalAgent.maxSockets = 1000;
  require('https').globalAgent.maxSockets = 1000;
  var app = require('./app');
  this.server = http.createServer(app);
  this.primus = socketServer.createSocketServer(this.server);
  socketServer.addHandler('build-stream', buildStream.buildStreamHandler);
  socketServer.addHandler('log-stream', logStream.logStreamHandler);
  socketServer.addHandler('terminal-stream', primusProxy.proxyStreamHandler);
  return this;
}

Server.prototype.start = function (cb) {
  this.server.listen(process.env.PORT, cb);
  return this;
};

Server.prototype.stop = function (cb) {
  this.server.close(cb);
  return this;
};


module.exports = Server;
