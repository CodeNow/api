var async = require('async');
var plus = /\+/g;
var slash = /\//g;
var minus = /-/g;
var underscore = /_/g;

var utils = module.exports = {
  exists: function (thing) {
    return thing !== null || thing !== undefined;
  },
  message: function (msg) {
    return function (req, res) {
      res.json({ message: msg });
    };
  },
  pause: function (req, res, next) {
    req.pause();
  },
  isObjectId: function (str) {
    str = str.toString();
    return Boolean(str.match(/^[0-9a-fA-F]{24}$/));
  },
  isObjectId64: function (str) {
    console.log(str);
    str = utils.decodeId(str);
    console.log(str);
    return Boolean(str.match(/^[0-9a-fA-F]{24}$/));
  },
  encodeId: function (id) {
    return new Buffer(id.toString(), 'hex').toString('base64').replace(plus, '-').replace(slash, '_');
  },
  decodeId: function (id) {
    return new Buffer(id.toString().replace(minus, '+').replace(underscore, '/'), 'base64').toString('hex');
  },
  equalObjectIds: function (objectId1, objectId2) {
    return objectId1.toString() === objectId2.toString();
  },
  series: function (/*middlewares*/) {
    var middlewares = Array.prototype.slice.call(arguments);
    return function (req, res, next) {
      middlewares = middlewares.map(function (mw) {
        return mw.bind(null, req, res);
      });
      async.series(middlewares, next);
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
    return function (/*requiredKeys*/) {
      var requiredKeys = Array.prototype.slice(arguments);
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
  }
};

var plus = /\+/g;
var slash = /\//g;