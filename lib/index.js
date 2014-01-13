var caching = require('./models/caching');
var cleanup = require('./cleanup');
var configs = require('./configs');
var domains = require('./domains');
var express = require('express');
var http = require('http');
var impexp = require('./rest/impexp');
var mongoose = require('mongoose');
var nodetime = require('nodetime');
var rollbar = require('rollbar');
var runnables = require('./rest/runnables');
var users = require('./rest/users');
var channels = require('./rest/channels');
var categories = require('./rest/categories');
var specifications = require('./rest/specifications');
var implementations = require('./rest/implementations');
var campaigns = require('./rest/campaigns');
var hour = 1000 * 60 * 60;
mongoose.connect(configs.mongo);
if (configs.rollbar) {
  rollbar.init(configs.rollbar.key, configs.rollbar.options);
}
function App(configs, domain) {
  var self = this;
  this.configs = configs;
  this.domain = domain;
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
    return cb();
  } else {
    this.listener = function (err) {
      if (self.domain && configs.throwErrors) {
        self.domain.emit('error', err);
      } else {
        self.stop(function () {
          self.cleanup();
        });
      }
    };
    process.on('uncaughtException', this.listener);
    return this.server.listen(this.configs.port, this.configs.ipaddress || '0.0.0.0', function (err) {
      if (err) {
        return cb(err);
      } else {
        self.started = true;
        return cb();
      }
    });
  }
};
App.prototype.stop = function (cb) {
  var self = this;
  if (!this.started) {
    return cb();
  } else {
    process.removeListener('uncaughtException', this.listener);
    return this.server.close(function (err) {
      if (err) {
        return cb(err);
      } else {
        self.started = false;
        delete self.listener;
        return cb();
      }
    });
  }
};
App.prototype.create = function () {
  var self = this;
  var app = express();
  app.use(domains(this.domain));
  if (configs.logExpress) {
    app.use(express.logger());
  }
  app.use(express.json());
  app.use(express.urlencoded());
  app.use(users(this.domain));
  app.use(impexp(this.domain));
  app.use(runnables(this.domain));
  app.use(channels(this.domain));
  app.use(categories(this.domain));
  app.use(specifications(this.domain));
  app.use(implementations(this.domain));
  app.use(campaigns(this.domain));
  app.use(app.router);
  if (configs.nodetime) {
    app.use(nodetime.expressErrorHandler());
  }
  if (configs.rollbar) {
    app.use(rollbar.errorHandler());
  }
  app.use(function (err, req, res, next) {
    if (configs.logErrorStack) {
      console.log(err.stack);
    }
    if (!err.domain && configs.throwErrors && req.parentDomain) {
      req.parentDomain.emit('error', err);
    } else {
      res.json(500, {
        message: 'something bad happened :(',
        error: err.message
      });
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