'use strict';
var http = require('http');
var loadenv = require('loadenv');
loadenv();
var mongoose = require('mongoose');
var nodetime = require('nodetime');
var rollbar = require('rollbar');
var path = require('path');
var primusProxy = require('./socket/primus-proxy.js');
var buildStream = require('./socket/build-stream.js');
var socketServer = require('./socket/socket-server.js');

mongoose.connect(process.env.MONGO);
if (process.env.ROLLBAR_KEY) {
  rollbar.init(process.env.ROLLBAR_KEY, {
    environment: process.env.ROLLBAR_OPTIONS_ENVIRONMENT || process.env.NODE_ENV || 'development',
    branch: process.env.ROLLBAR_OPTIONS_BRANCH || 'master',
    root: path.resolve(__dirname, '..')
  });
}

function ensureMongooseIsConnected (cb) {
  if (mongoose.connection.readyState === 1) {
    cb();
  }
  else {
    mongoose.connection.once('connected', cb);
  }
}

function App() {
  this.started = false;
  this.isStopping = false;
  this.create();
}
App.prototype.start = function (cb) {
  var self = this;
  if (this.started) {
    cb();
  } else {
    this.listener = function (err) {
      console.error('uncaughtException', err);
      console.error('uncaughtException', err.stack);
      self.stop(function () {
        self.cleanup();
      });
    };
    process.on('uncaughtException', this.listener);
    ensureMongooseIsConnected(function (err) {
      if (err) { return cb(err); }

      self.server.listen(process.env.PORT, process.env.IPADDRESS || '0.0.0.0', function (err) {
        if (err) { return cb(err); }
        self.started = true;
        cb();
      });
    });
  }
  return this;
};
App.prototype.stop = function (cb) {
  var self = this;
  if (!this.started) {
    cb();
  } else {
    if(this.isStopping) {
      return cb();
    }
    this.isStopping = true;
    process.removeListener('uncaughtException', this.listener);
    this.server.close(function (err) {
      if (err) {
        cb(err);
      } else {
        self.started = false;
        delete self.listener;
        cb();
      }
    });
  }
  return this;
};

App.prototype.create = function () {
  var app = require('./app');
  this.server = http.createServer(app);
  this.primus = socketServer.createSocketServer(this.server);
  socketServer.addHandler('build-stream', buildStream.buildStreamHandler);
  socketServer.addHandler('terminal-stream', primusProxy.proxyStreamHandler);
  return this.server;
};

App.prototype.cleanup = function () {
  if (process.env.NODETIME_ACCOUNT_KEY) {
    nodetime.destroy();
  }
  if (process.env.ROLLBAR || process.env.ROLLBAR_KEY) {
    rollbar.shutdown();
  }
  setTimeout(function () {
    var exception_err, timer;
    try {
      timer = setTimeout(function () {
        return process.exit(1);
      }, 30000);
      timer.unref();
    } catch (_error) {
      exception_err = _error;
      if (process.env.LOG_ERROR_STACK) {
        console.error(exception_err.stack);
      }
    }
    process.exit();
  }, 10000);
};
module.exports = App;
