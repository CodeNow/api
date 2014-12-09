'use strict';
var http = require('http');
var loadenv = require('loadenv');
var createCount = require('callback-count');
loadenv();
if (process.env.NEWRELIC_NAME && process.env.NEWRELIC_KEY) {
  require('newrelic');
}
var mongoose = require('mongoose');
var primusProxy = require('./socket/terminal-stream.js');
var buildStream = require('./socket/build-stream.js');
var logStream = require('./socket/log-stream.js');
var socketServer = require('./socket/socket-server.js');
var error = require('error');
var debug = require('debug')('server:server');
var dnsJobQueue = require('models/redis/dns-job-queue');

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
  var count = createCount(cb);
  this.server.listen(process.env.PORT, count.inc().next);
  dnsJobQueue.start(count.inc().next);
  return this;
};

Server.prototype.stop = function (cb) {
  var count = createCount(cb);
  this.server.close(count.inc().next);
  dnsJobQueue.stop(count.inc().next);
  return this;
};


module.exports = Server;
