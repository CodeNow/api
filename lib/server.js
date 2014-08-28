'use strict';
var http = require('http');
var loadenv = require('loadenv');
loadenv();
var mongoose = require('mongoose');
var primusProxy = require('./socket/terminal-stream.js');
var buildStream = require('./socket/build-stream.js');
var logStream = require('./socket/log-stream.js');
var socketServer = require('./socket/socket-server.js');
var error = require('error');

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
  var self = this;
  mongoose.connect(process.env.MONGO, function(err) {
    if (err) {
      error.log(err);
      return cb(err);
    }
    self.server.listen(process.env.PORT, cb);
  });
  return this;
};

Server.prototype.stop = function (cb) {
  this.server.close(function(){
    mongoose.disconnect(cb);
  });
  return this;
};


module.exports = Server;
