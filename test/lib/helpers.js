require('./setupAndTeardown');
var async = require('async');
var _ = require('lodash');
var st = require('./superdupertest');
var httpMethods = require('methods');

var extendWith = function (obj2) {
  return function (obj1) {
    _.extend(obj1, obj2);
  };
};

var helpers = module.exports = {
  getRequestStr: function (context) {
    var spec = context.runnable();
    var title = -1;
    while (spec) {
      if (/^[^ ]* \/[^ ]*$/.test(spec.title)) {
        title = spec.title;
        break;
      }
      spec = spec.parent;
    }
    return title;
  },
  asyncExtend: function (dst, src, cb) {
    async.parallel(src, function (err, results) {
      if (err) {
        return cb(err);
      }
      _.extend(dst, results);
      cb(null, dst, results);
    });
  },
  extendContext: function (key, value) {
    var obj;
    if (typeof key === 'object') {
      obj = key;
    } else {
      obj = {};
      obj[key] = value;
    }
    return function (done) {
      var context = this;
      var tasks = {};
      Object.keys(obj).forEach(function (key) {
        var val = obj[key];
        if (typeof val === 'function') {
          tasks[key] = val; // tasks for async values
        }
        else {
          context[key] = val;
        }
      });
      var requestStr = helpers.getRequestStr(context);
      helpers.asyncExtend(context, tasks, function (err, ctx, results) {
        if (err) {
          return done(err);
        }
        _.values(results).forEach(extendWith({requestStr:requestStr}));
        done();
      });
    };
  },
  randomValue: function () {
    return 'value' + Math.random();
  },
  createServer: function () {
    var d = require('domain').create();
    var server = new (require('../../lib/index'))({}, d);
    d.on('error', function (err) {
      console.log(err.message);
      console.log(err.stack);
    });
    return server.create();
  },
  createImageFromFixture: function (name, callback) {
    var users = require('./userFactory');
    users.createAdmin(function (err, user) {
      if (err) {
        return callback(err);
      }
      user.createImageFromFixture(name)
        .streamEnd(function (err, res) {
          if (err) {
            return callback(err);
          }
          callback(null, res.body);
        });
    });
  },
  deleteImage: function (imageId, callback) {
    helpers.deleteRunnable('/runnables/', imageId, callback);
  },
  deleteContainer: function (containerId, callback) {
    helpers.deleteRunnable('/users/me/runnables/', containerId, callback);
  },
  deleteRunnable: function (urlPath, runnableId, callback) {
    var users = require('./userFactory');
    users.createAdmin({}, function (err, user) {
      if (err) {
        return callback(err);
      }
      user.del(urlPath + runnableId)
        .expect(200)
        .end(callback);
    });
  }
};
helpers.request = { /* post, get, put, patch, delete, ... */ };
httpMethods.forEach(function (method) {
  if (method === 'delete') {
    method = 'del';
  }
  helpers.request[method] = function (urlPath, token) {
    var app = helpers.createServer();
    var request = st(app)[method.toLowerCase()](urlPath);
    if (token) {
      request.set('runnable-token', token);
    }
    return request;
  };
});