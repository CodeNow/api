var _ = require('lodash');
var async = require('async');
var configs = require('configs');
_.mixin(require('underscore.inflections'));
var error = require('error');
var plus = /\+/g;
var slash = /\//g;
var minus = /-/g;
var underscore = /_/g;
var mongoose = require('mongoose');
var utils = module.exports = {
  //
  // middlewares
  //
  formatPaging: function () {
    var query = require('./query');
    return utils.series(
      query.setDefault('page', 0),
      query.setDefault('limit', configs.defaultPageLimit),
      query.max('limit', configs.maxPageLimit),
      query.isNumber('page'),
      query.isNumber('limit')
    );
  },
  log: function (/*message, keys...*/) {
    var keys = Array.prototype.slice.call(arguments);
    return function (req, res, next) {
      var localKeys = utils.replacePlaceholders(req, keys);
      var c = console;
      c.log.apply(c, localKeys);
      next();
    };
  },
  require: function (key) {
    return function (req, res, next) {
      if (!req[key]) {
        return next(error(404, key+' not found'));
      }
      next();
    };
  },
  conflict: function (key, message) {
    return function (req, res, next) {
      if (req[key]) {
        return next(error(409, message));
      }
      next();
    };
  },
  code: function (code) {
    return function (req, res, next) {
      res.code = code;
      next();
    };
  },
  message: function (code, msg) {
    if (typeof code === 'string') {
      msg = code;
      code = 200;
    }
    return function (req, res) {
      res.json(code, { message: msg });
    };
  },
  series: function (/*middlewares*/) {
    var middlewares = Array.isArray(arguments[0]) ? arguments[0] :
      Array.prototype.slice.call(arguments);
    return function (req, res, next) {
      var tasks = middlewares.map(function (mw) {
        return mw.bind(null, req, res);
      });
      async.series(tasks, next);
    };
  },
  or: function (/*middlewares*/) {
    var middlewares = Array.prototype.slice.call(arguments);
    var rand = Math.random();
    return function (req, res, next) {
      var firstErr;
      asyncSomeSeries(middlewares, function (task, cb) {
        task(req, res, function (err) {
          firstErr = firstErr || err;
          cb(null, !err);
        });
      },
      function (err, some) {
        if (err) {
          return next(err); // this should never happen here.
        }
        if (some) {
          next();
        }
        else {
          next(firstErr);
        }
      });
    };
  },
  ternary: function (test, middlewareTrue, middlewareFalse) {
    return function (req, res, next) {
      test(req, res, function (err) {
        if (err) {
          middlewareFalse(req, res, next);
        }
        else {
          middlewareTrue(req, res, next);
        }
      });
    };
  },
  if: function (test /*, middlewares*/) {
    var middlewares = Array.prototype.slice.call(arguments, 1);
    return utils.ternary(test,
      utils.series.apply(null, middlewares),
      utils.next);
  },
  unless: function (test /*, middlewares*/) {
    var middlewares = Array.prototype.slice.call(arguments, 1);
    return utils.ternary(test,
      utils.next,
      utils.series.apply(null, middlewares));
  },
  every: function (reqKey, test, code, message, ctx) {
    return function (requiredKeys) {
      return function (req, res, next) {
        var errKey, err, every;
        every = requiredKeys.every(function (key) {
          var pass = test.call(ctx, req[reqKey][key]);
          if (!pass) {
            errKey = key;
          }
          return pass;
        });
        if (!every) {
          err = error(code, message.replace('{{key}}', errKey));
        }
        next(err);
      };
    };
  },
  next: function (req, res, next) {
    next();
  },
  error: function (code, message) {
    return function (req, res, next) {
      next(error(code, message));
    };
  },
  reqIf: function (key /*, middlewares*/) {
    var test = utils.require(key);
    var args = Array.prototype.slice.call(arguments, 1);
    args.unshift(test);
    return utils.if.apply(utils, args);
  },
  reqUnless: function (key /*, middlewares*/) {
    var test = utils.require(key);
    var args = Array.prototype.slice.call(arguments, 1);
    args.unshift(test);
    return utils.unless.apply(utils, args);
  },
  respond: function (code, key) {
    if (typeof code === 'string') {
      key = code;
      code = null;
    }
    return function (req, res, next) {
      var val = req[key];
      if (!val) {
        res.json(404, key+' not found');
      }
      else {
        if (val.toJSON) {
          val = val.toJSON();
        }
        res.json(code || 200, val);
      }
    };
  },
  //
  // utils
  //
  createObjectId: function () {
    return mongoose.Types.ObjectId();
  },
  requireKeys: function (obj, keys) {
    var err;
    keys.some(function (key) {
      if (!utils.exists(data[key])) {
        err = error(400, key + ' is required');
        return err;
      }
    });
    return err;
  },
  strToBoolean: function (str) {
    if (str === 'true') {
      return true;
    }
    if (str === 'false') {
      return false;
    }
    return str;
  },
  newFilledArray: function (len, val) {
    return Array.apply(null, new Array(len)).map(function () {
      return val;
    });
  },
  exists: function (thing) {
    return thing != null;
  },
  pause: function (req, res, next) {
    req.pause();
    next();
  },
  isObjectId: function (str) {
    str = str.toString();
    return Boolean(str.match(/^[0-9a-fA-F]{24}$/));
  },
  isNumber: function (thing) {
    str = thing.toString();
    var num = parseInt(str);
    return !isNaN(num);
  },
  isObjectId64: function (str) {
    if (!utils.exists(str)) {
      return false;
    }
    str = utils.decodeId(str);
    return Boolean(str.match(/^[0-9a-fA-F]{24}$/));
  },
  isObjectIdArray: function (arr) {
    return arr.every(utils.isObjectId);
  },
  encodeId: function (id) {
    return new Buffer(id.toString(), 'hex')
      .toString('base64')
      .replace(plus, '-')
      .replace(slash, '_');
  },
  decodeId: function (id) {
    return new Buffer(id.toString()
      .replace(minus, '+')
      .replace(underscore, '/'), 'base64')
      .toString('hex');
  },
  equalObjectIds: function (objectId1, objectId2) {
    return objectId1 && objectId2 && (objectId1.toString() === objectId2.toString());
  },
  arrayToString: function (arr, conjunction, after) {
    arr = _.clone(arr);
    var last = arr.pop();

    return (arr.length === 0) ?
      last :
      [arr.join(', '), conjunction, last, after].join(' ');
  },
  pluralize: function (str) {
    return _.pluralize(str);
  },
  singularize: function (str) {
    return _.singularize(str);
  },
  capitalize: function (str) {
    return str[0].toUpperCase() + str.slice(1);
  },
  get: function (obj, keyPath) {
    var not = false;
    if (keyPath[0] === '!') {
      not = true;
      keyPath = keyPath.slice(1);
    }
    var pathSplit = keyPath.split('.');
    return pathSplit.reduce(function (val, key) {
      if (!val || !val[key]) {
        return null;
      }
      return not ? !val[key] : val[key];
    }, obj);
  },
  replacePlaceholders: function (ctx, args) {
    return handle(args);
    function handle (thing) {
      if (Array.isArray(thing)) {
        return thing.map(handle);
      }
      else if (_.isObject(thing)) {
        return handleObject(thing);
      }
      else if (typeof thing === 'string') {
        var val = utils.get(ctx, thing);
        return utils.exists(val) ? val : thing;
      }
      else {
        return thing;
      }
    }
    function handleObject (obj) {
      if (Object.getPrototypeOf(obj).constructor.name !== 'Object') {
        //ignore special objects like ObjectIds
        return obj;
      }
      var out = {};
      Object.keys(obj).forEach(function (key) {
        out[key] = handle(obj[key]);
      });
      return out;
    }
  },
  bifilter: function (arr, test) {
    var out = {};
    out.true = [];
    out.false = [];
    arr.forEach(function (item) {
      if (test(item)) {
        out.true.push(item);
      }
      else {
        out.false.push(item);
      }
    });
    return out;
  }
};


function asyncSomeSeries (tasks, iterator, callback) {
  tasks = _.clone(tasks);
  go();
  function go() {
    var task = tasks.shift();
    if (!task) {
      callback(null, false);
    }
    else {
      iterator(task, function (err, some) {
        if (err) {
          callback(error);
        }
        else if (some) {
          callback(null, true);
        }
        else {
          go();
        }
      });
    }
  }
}