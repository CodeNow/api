'use strict';
var http = require('http');
var loadenv = require('loadenv');
loadenv();
if (process.env.NEWRELIC_NAME && process.env.NEWRELIC_KEY) {
  require('newrelic');
}
var mongoose = require('mongoose');
var SocketServer = require('socket/socket-server.js');
var error = require('error');
var debug = require('debug')('server:server');

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
  this.socketServer = new SocketServer(this.server);

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
