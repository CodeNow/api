var _ = require('lodash');
_.mixin(require('underscore.inflections'));
var async = require('async');
var error = require('error');
var plus = /\+/g;
var slash = /\//g;
var minus = /-/g;
var underscore = /_/g;

var utils = module.exports = {
  //
  // middlewares
  //
  log: function (/*message, keys...*/) {
    var keys = Array.prototype.slice.call(arguments);
    return function (req, res, next) {
      keys = utils.replacePlaceholders(req, keys);
      console.log(keys);
      console.log.apply(console, keys);
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
    return function (req, res, next) {
      var firstErr;
      async.some(middlewares, function (mw, cb) {
        mw(req, res, function (err) {
          firstErr = firstErr || err;
          cb(!err);
        });
      },
      function (some) {
        var err = some ? null : firstErr;
        next(err);
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
  //
  // utils
  //
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
  isObjectId64: function (str) {
    if (!utils.exists(str)) {
      return false;
    }
    str = utils.decodeId(str);
    return Boolean(str.match(/^[0-9a-fA-F]{24}$/));
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
  get: function (obj, keyPath) {
    var pathSplit = keyPath.split('.');
    return pathSplit.reduce(function (val, key) {
      if (!val || !val[key]) {
        return null;
      }
      return val[key];
    }, obj);
  },
  replacePlaceholders: function (obj, args) {
    return handle(args);
    function handle (thing) {
      if (Array.isArray(thing)) {
        return args.map(handle);
      }
      else if (_.isObject(thing)) {
        return handleObject(thing);
      }
      else if (typeof thing === 'string') {
        return utils.get(obj, thing) || thing;
      }
      else {
        return thing;
      }
    }
    function handleObject (obj) {
      var out = {};
      Object.keys(obj).forEach(function (key) {
        out[key] = handle(obj[key]);
      });
      return out;
    }
  }
};
