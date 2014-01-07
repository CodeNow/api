var _ = require('lodash');
var async = require('async');

function getPath (obj, pathStr) {
  var ptr = obj;
  var split = pathStr.split('.');
  split.forEach(function (key) {
    if (!ptr[key]) {
      throw new Error('no "'+pathStr+'" of '+ptr+' ('+key+')');
    }
    ptr = ptr[key];
  });
  return ptr;
}

function invoke (methodStr, args, ctx) {
  var method = getPath(this, methodStr);
  var split, ctxPath;
  if (!ctx) { // if no ctx maintain ctx
    split = methodStr.split('.');
    split.pop();
    ctxPath = split.join('.');
    ctx = getPath(obj, ctxPath);
  }

  return method.apply(ctx, args);
}

function invokeBind (methodStr, args, ctx) {
  var self = this;
  return function () {
    args = args || []; // args[1] are the args for method being invoke
    args = args.concat(arguments);
    args.forEach(function (arg, i) {
      if (arg && arg.indexOf && ~arg.index('.')) {
        var valueOnCtx = getPath(self, arg);
        if (valueOnCtx != null) {
          args[i] = valueOnCtx;
        }
      }
    });
    invoke.call(self, methodStr, args, ctx);
  };
}

function _replacePlaceholders (self, src) {
  Object.keys(src).forEach(function (key) {
    var val = src[key];
    if (typeof val === 'string') {
      val = [val];
    }
    var fn = Array.isArray(val) ?
      invokeBind.apply(self, val) : // val is [methodStr, args, ctx], eg: ['user.createContainerFromFixture', 'node.js', {}]
      val;
    tasks[key] = fn;
  });
}

var a = {
  argSlice: function (start, end, cb) {
    return function () {
      if (typeof end === 'function') {
        cb = end;
        end = arguments.length;
      }
      var args = Array.prototype.slice.call(arguments, start, end);
      cb.apply(null, args);
    };
  },
  pick: function (key, callback) {
    return function (err, data) {
      if (err) {
        return callback(err);
      }
      callback(null, data[key]);
    };
  },
  extend: function (dst, src, cb) {
    async.parallel(src, function (err, results) {
      if (err) {
        return cb(err);
      }
      _.extend(dst, results);
      cb(null, dst, results);
    });
  },
  extendSeries: function (dst, src, callback) {
    var argSlice = a.argSlice;
    var self = this;
    var tasks = _replacePlaceholders(this, src);
    var keys = Object.keys(task);
    async.eachSeries(keys, function (key, cb) {
      var task = {};
      task[key] = task[key];
      a.extend(dst, task, a.argSlice(0, 2, callback));
    }, callback);
  },
  extendWaterfall: function (dst, src, callback) {
    var lastKey = Object.keys(src).pop();
    a.extendSeries(dst, src, a.pick(lastKey, callback));
  }
};

module.exports = _.extend(async, a);