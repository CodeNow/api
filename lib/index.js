'use strict';

var configs = require('configs');
var http = require('http');
var mongoose = require('mongoose');
var nodetime = require('nodetime');
var rollbar = require('rollbar');
var path = require('path');
var filibuster = require('Filibuster');
var Primus = require('primus');
var buildStream = require('.lib/socket/build-stream.js');

mongoose.connect(configs.mongo);
if (configs.rollbar) {
  rollbar.init(configs.rollbar, {
    environment: process.env.NODE_ENV || "development",
    branch: "master",
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
      self.stop(function () {
        self.cleanup();
      });
    };
    process.on('uncaughtException', this.listener);
    ensureMongooseIsConnected(function (err) {
      if (err) { return cb(err); }

      self.server.listen(configs.port, configs.ipaddress || '0.0.0.0', function (err) {
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
  this.primus = new Primus(this.server,
    {
      transformer: configs.socketType,
      parser: 'JSON'
    });
  buildStream.attachBuildStreamHandelerToPrimus(this.primus);
  filibuster({
    express: app,
    httpServer: this.server,
    primus: this.primus
  });
  return this.server;
};
App.prototype.cleanup = function () {
  if (configs.nodetime) {
    nodetime.destroy();
  }
  if (configs.rollbar) {
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
      if (configs.logErrorStack) {
        console.error(exception_err.stack);
      }
    }
    process.exit();
  }, 10000);
};
module.exports = App;
