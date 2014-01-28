var configs = require('configs');
var http = require('http');
var mongoose = require('mongoose');
var nodetime = require('nodetime');
var rollbar = require('rollbar');
var hour = 1000 * 60 * 60;
mongoose.connect(configs.mongo);
if (configs.rollbar) {
  rollbar.init(configs.rollbar.key, configs.rollbar.options);
}
function App() {
  var self = this;
  this.started = false;
  this.create();
  setTimeout(function () {
    self.stop(function () {
      self.cleanup();
    });
  }, hour + Math.random() * hour);
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
    mongoose.connection.once('connected', function() {
      self.server.listen(configs.port, configs.ipaddress || '0.0.0.0', function (err) {
        if (err) {
          cb(err);
        } else {
          self.started = true;
          cb();
        }
      });
    });
  }
};
App.prototype.stop = function (cb) {
  var self = this;
  if (!this.started) {
    cb();
  } else {
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
};
App.prototype.create = function () {
  var self = this;
  var app = require('./app');
  app.use(errorMiddleware);
  this.server = http.createServer(app);
  return this.server;
  function errorMiddleware (err, req, res, next) {
    errorHandler(err);
    if (err.isResponseError) {
      res.json(err.code || 500, {
        message: err.msg,
        stack: configs.throwErrors ? err.stack : undefined
      });
    }
    else {
      res.json(500, {
        message: 'something bad happened :(',
        stack: configs.throwErrors ? err.stack : undefined
      });
    }
  }
  function errorHandler (err) {
    if (err.code === 500 || err.code === undefined) {
      if (configs.logErrorStack) {
        console.error(err);
      }
      self.stop(function () {
        self.cleanup();
      });
    }
  }
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