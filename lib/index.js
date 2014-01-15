var caching = require('./models/caching');
var cleanup = require('./cleanup');
var configs = require('./configs');
var domains = require('./domains');
var express = require('express');
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
      self.stop(function () {
        self.cleanup();
      });
    };
    process.on('uncaughtException', this.listener);
    return this.server.listen(configs.port, configs.ipaddress || '0.0.0.0', function (err) {
      if (err) {
        cb(err);
      } else {
        self.started = true;
        cb();
      }
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
  var app = express();
  app.use(domains);
  if (configs.logExpress) {
    app.use(express.logger());
  }
  app.use(express.json());
  app.use(express.urlencoded());
  app.use(require('./rest/users'));
  app.use(require('./rest/impexp'));
  app.use(require('./rest/runnables'));
  app.use(require('./rest/channels'));
  app.use(require('./rest/categories'));
  app.use(require('./rest/specifications'));
  app.use(require('./rest/implementations'));
  app.use(require('./rest/campaigns'));
  app.use(app.router);
  if (configs.nodetime) {
    app.use(nodetime.expressErrorHandler());
  }
  if (configs.rollbar) {
    app.use(rollbar.errorHandler());
  }
  app.use(function (err, req, res, next) {
    if (configs.logErrorStack && false) {
      console.log(err.stack);
    }
    res.json(err.code || 500, {
      message: err.msg || 'something bad happened :(',
      error: err.message
    });
    if (err.code === 500 || err.code === undefined) {
      self.stop(function () {
        self.cleanup();
      });
    }
  });
  app.get('/cleanup', cleanup);
  app.get('/cache', caching.updateAllCaches);
  app.get('/', function (req, res) {
    res.json({ message: 'runnable api' });
  });
  app.all('*', function (req, res) {
    res.json(404, { message: 'resource not found' });
  });
  this.server = http.createServer(app);
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
        console.log(exception_err.stack);
      }
    }
    process.exit();
  }, 10000);
};
module.exports = App;