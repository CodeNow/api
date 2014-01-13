// require('console-trace')({always:true, right:true});
require('./setupAndTeardown');
var _ = require('lodash');
var st = require('./superdupertest');
var httpMethods = require('methods');
var db = require('./db');
var async = require('./async');

var helpers = module.exports = {
  fakeShortId: function () {
    return '1234567890123456';
  },
  fakeId: function () {
    return '123456789012345678901234';
  },
  createCheckDone: function (done) {
    var CheckDone = require('./CheckDone');
    return new CheckDone(done);
  },
  pluralize: function (str) {
    var re = /[sxz]/;
    return (re.test(_.last(str))) ?
      str+'es' :
      str+'s';
  },
  capitalize: function (str) {
    var firstChar = str[0];
    return firstChar ?
      str[0].toUpperCase()+str.slice(1).toLowerCase() :
      str;
  },
  getRequestStr: function (context) {
    var spec = context.runnable();
    var title = -1;
    while (spec) {
      if (/^[A-Z]* \/[^ ]*$/.test(spec.title)) {
        title = spec.title;
        break;
      }
      spec = spec.parent;
    }
    return title;
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
  extendWithReqStr: function (ctx, callback) {
    var extendWith = helpers.extendWith;
    var reqData = { requestStr: helpers.getRequestStr(ctx) };
    return function (err, data) {
      if (err) {
        return callback(err);
      }
      _.values(data).forEach(extendWith(reqData));
      callback(null, data);
    };
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
      var keys = Object.keys(obj);
      keys.forEach(function (key) {
        var val = obj[key];
        if (typeof val === 'function') {
          tasks[key] = val; // tasks for async values
        }
        else {
          context[key] = val;
        }
      });
      async.extend(context, tasks, helpers.extendWithReqStr(this, done));
      // set cleanup keys
      this._cleanupKeys = _.unique((this._cleanupKeys || []).concat(keys));
    };
  },
  extendContextSeries: function (tasks) {
    return function (done) {
      async.extendSeries(this, tasks, helpers.extendWithReqStr(this, done));
      // set cleanup keys
      this._cleanupKeys = _.unique((this._cleanupKeys || []).concat());
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
    helpers.deleteKeys(this, this._cleanupKeys); // clean context keys
    this._cleanupKeys = [];
    return helpers.cleanupExcept()(callback);
  },
  cleanupExcept: function (exclude) {
    exclude = Array.isArray(exclude) ?
      exclude :
      Array.prototype.slice.call(arguments);
    // clean context keys
    return function (callback) {
      helpers.deleteKeys(this, _.difference(this._cleanupKeys, exclude));
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
      var excludeWithPlurals = exclude.concat(exclude.map(helpers.pluralize)); // pluralize since images end in s
      helpers.deleteKeys(tasks, excludeWithPlurals);
      async.waterfall([
        async.parallel.bind(async, tasks),
        function (results, cb) {
          db.dropCollectionsExcept(excludeWithPlurals)(cb);
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