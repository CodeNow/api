var _ = require('lodash');
var async = require('async');

function getPath (obj, pathStr) {
  var ptr = obj;
  var split = pathStr.split('.');
  for (var i = 0, key; i < split.length; i++) {
    key = split[i];
    if (!ptr[key]) {
      return new Error('no "'+key+'" of '+ptr+' ('+pathStr+')');
    }
    ptr = ptr[key];
  }
  return ptr;
}

function invoke (methodStr, args, ctx) {
  var method = getPath(this, methodStr);
  if (method instanceof Error) {
    console.error(err.message); // log before throw bc mocha isnt always displaying throws
    throw method;
  }
  var split, ctxPath;
  if (!ctx) { // if no ctx maintain ctx
    split = methodStr.split('.');
    split.pop();
    ctxPath = split.join('.');
    ctx = getPath(this, ctxPath);
  }

  return method.apply(ctx, args);
}

function replacePlaceholderArgs (obj, args) {
  var newargs = [];
  args.forEach(function (arg, i) {
    if (arg && arg.indexOf && ~arg.indexOf('.')) {
      var val = getPath(obj, arg);
      newargs[i] = (val instanceof Error) ?
        args[i] :
        val;
    }
    else {
      newargs[i] = args[i];
    }
  });
  return newargs;
}

function invokeBind (methodStr, args, ctx) {
  var self = this;
  args = args || []; // args[1] are the args for method being invoke
  return function (cb) {
    var newargs = Array.prototype.slice.call(arguments);
    args = replacePlaceholderArgs(self, args);
    args = args.concat(newargs);
    invoke.call(self, methodStr, args, ctx);
  };
}

function _replaceInvokePlaceholders (self, src) {
  var tasks = {};
  Object.keys(src).forEach(function (key) {
    var val = src[key];
    if (typeof val === 'string') {
      val = [val];
    }
    if (Array.isArray(val)) {
      if (val[1] && !Array.isArray(val[1])) {
        var err = new Error('Placeholder args must be an array: [' + val + ']');
        console.error(err.message); // log before throw bc mocha isnt always displaying throws
        throw err;
      }
      fn = invokeBind.apply(self, val); // val is [methodStr, args, ctx], eg: ['user.createContainerFromFixture', 'node.js', {}]
    }
    else {
      fn = val;
    }
    tasks[key] = fn;
  });
  return tasks;
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
    var keys = Object.keys(src);
    var results = {};
    async.eachSeries(keys, function (key, cb) {
      var task = {};
      task[key] = src[key];
      task = _replaceInvokePlaceholders(dst, task);
      a.extend(dst, task, function (err, val, res) {
        _.extend(results, res);
        cb(err, val);
      });
    }, function (err) {
      if (err) {
        return callback(err);
      }
      callback(err, dst, results);
    });
  },
  extendWaterfall: function (dst, src, callback) {
    var lastKey = Object.keys(src).pop();
    a.extendSeries(dst, src, a.pick(lastKey, callback));
  }
};

module.exports = _.extend(async, a);