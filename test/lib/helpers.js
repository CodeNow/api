require('./setupAndTeardown');
var async = require('async');
var _ = require('lodash');
var st = require('./superdupertest');
var httpMethods = require('methods');
var db = require('./db');

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
  deleteKeys: function (obj, keys) {
    keys = Array.isArray(keys) ?
      keys :
      Array.prototype.slice.call(arguments, 1);

    keys.forEach(function (key) {
      delete obj[key];
    });
  },
  extendWith: function (obj2) {
    return function (obj1) {
      _.extend(obj1, obj2);
    };
  },
  extendContext: function (key, value) {
    var obj;
    var extendWith = helpers.extendWith;
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
  cleanup: function (callback) {
    return helpers.cleanupExcept()(callback);
  },
  cleanupExcept: function (exclude) {
    exclude = Array.isArray(exclude) ?
      exclude :
      Array.prototype.slice.call(arguments);
    return function (callback) {
      var images = require('./imageFactory');
      var containers = require('./containerFactory');
      var tasks = {
        images: async.waterfall.bind(async, [
          db.images.find.bind(db.images),
          images.deleteImages
        ]),
        containers: async.waterfall.bind(async, [
          db.containers.find.bind(db.containers),
          containers.deleteContainers
        ])
      };
      // helpers.deleteKeys(tasks, exclude);
      async.waterfall([
        async.parallel.bind(async, tasks),
        function (results, cb) {
          db.dropCollectionsExcept(exclude)(cb);
        }
      ], callback);
    };
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