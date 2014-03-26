var _ = require('lodash');
var error = require('error');
var utils = require('middleware/utils');
var or = utils.or;
var ternary = utils.ternary;
var series = utils.series;

var RequestData = module.exports = function (dataType) {
  this.dataType = dataType;
  this.every = utils.every.bind(null, dataType);
  if (dataType === 'query') {
    this.dataName = 'query parameter';
  } else if (dataType === 'body') {
    this.dataName = 'body parameter';
  } else if (dataType === 'params') {
    this.dataName = 'url parameter';
  } else if (dataType === 'headers') {
    this.dataName = 'header';
  }
};
RequestData.prototype.map = function (key, fn) {
  return function (req, res, next) {
    req[key] = fn(req[key]);
    next();
  };
};
RequestData.prototype.decodeId = function (/*keys*/) {
  var dataType = this.dataType;
  var keys = Array.prototype.slice.call(arguments);
  return series(
    this.isObjectId64.apply(this, keys),
    decodeAll
  );
  function decodeAll (req, res, next) {
    keys.forEach(function (key) {
      req[dataType][key] = utils.decodeId(req[dataType][key]);
    });
    next();
  }
};
RequestData.prototype.pickAndRequire = function (/* keys */) {
  var args = Array.prototype.slice.call(arguments);
  return series(
    this.pick.apply(this, args),
    this.require.apply(this, args)
  );
};
RequestData.prototype.pickAndRequireOne = function (/* keys */) {
  var args = Array.prototype.slice.call(arguments);
  return series(
    this.pick.apply(this, args),
    this.requireOne.apply(this, args)
  );
};
RequestData.prototype.require = function (/* keys */) {
  var keys = Array.prototype.slice.call(arguments);
  var errMessage = '"{{key}}" '+this.dataName+' is required';
  var self = this;
  return function (req, res, next) {
    var data = req[self.dataType];
    var key;
    if (!data || !keyIsProperty()) {
      next(error(400, errMessage.replace('{{key}}', key)));
    }
    else {
      next();
    }
    function keyIsProperty () {
      return keys.every(function (k) {
        key = k;
        return data.hasOwnProperty(k);
      });
    }
  };
};
RequestData.prototype.requireOne = function (/* keys */) {
  var self = this;
  var keys = Array.prototype.slice.call(arguments);
  var requires = keys.map(function (key) {
    return self.require(key);
  });
  var requireOne = or.apply(null, requires);
  var message = utils.arrayToString(keys, 'or', this.dataName+' is required');
  return ternary(requireOne,
      utils.next,
      utils.error(400, message));
};
RequestData.prototype.equals = function (key, value) {
  var self = this;
  return function (req, res, next) {
    if (req[self.dataType][key] === value) {
      next();
    } else {
      next(error(400, self.dataName + ' ' + key + ' does not match ' + value));
    }
  };
};
RequestData.prototype.contains = function (key, value) {
  var self = this;
  var re = new RegExp(value);
  return function (req, res, next) {
    if (req[self.dataType][key] == null) {
      next(error(400, self.dataName + ' ' + key + ' does not exist'));
    } else if (!re.test(req[self.dataType][key])) {
      next(error(400, self.dataName + ' ' + key + ' does not match ' + value));
    } else {
      next();
    }
  };
};
RequestData.prototype.pick = function (/* keys */) {
  var keys = Array.prototype.slice.call(arguments);
  var dataType = this.dataType;
  return function (req, res, next) {
    req[dataType] = _.pick(req[dataType], keys);
    next();
  };
};
RequestData.prototype.isTrue = function (/* keys */) {
  var args = Array.prototype.slice.call(arguments);
  var errMessage = '"{{key}}" '+this.dataName+' must be true';
  return this.every(isTrue, 400, errMessage)(args);
  function isTrue (val) {
    return val === true;
  }
};
RequestData.prototype.trim = function (/* keys */) {
  var keys = Array.prototype.slice.call(arguments);
  var dataType = this.dataType;
  return series(
    this.isString.apply(this, arguments),
    trimAll
  );
  function trimAll (req, res, next) {
    keys.forEach(function (keyKey) {
      var key = utils.replacePlaceholders(req, keyKey);
      req[dataType][key] = req[dataType][key].trim();
      next();
    });
  }
};
RequestData.prototype.isString = function (/* keys */) {
  var args = Array.prototype.slice.call(arguments);
  var errMessage = '"{{key}}" '+this.dataName+' must be a string';
  return this.every(utils.isString, 400, errMessage)(args);
};
RequestData.prototype.isNumber = function (/* keys */) {
  var args = Array.prototype.slice.call(arguments);
  var errMessage = '"{{key}}" '+this.dataName+' must be a number';
  return this.every(utils.isNumber, 400, errMessage)(args);
};
RequestData.prototype.instanceOf = function (key, Class) {
  var dataType = this.dataType;
  var self = this;
  return function (req, res, next) {
    var lowercaseClassName = (Class.name || '').toLowerCase();
    var instanceofClass = (req[dataType][key] instanceof Class);
    var typeofClassName = typeof req[dataType][key] === lowercaseClassName;
    if (!instanceofClass && !typeofClassName) {
      return next(error(400, '"'+key+'" '+self.dataName+' must be an '+lowercaseClassName));
    }
    next();
  };
};
RequestData.prototype.isObjectId = function () {
  var args = Array.prototype.slice.call(arguments);
  var errMessage = '"{{key}}" '+this.dataName+' must be an object id';
  return this.every(utils.isObjectId, 400, errMessage)(args);
};
RequestData.prototype.isObjectIdArray = function () {
  var args = Array.prototype.slice.call(arguments);
  args = args.map(function (arg) {
    return !Array.isArray(arg)? [arg] : arg;
  });
  var errMessage = '"{{key}}" '+this.dataName+' must be an array of object ids';
  return this.every(utils.isObjectIdArray, 400, errMessage)(args);
};
RequestData.prototype.isObjectId64 = function () {
  var args = Array.prototype.slice.call(arguments);
  var errMessage = '"{{key}}" '+this.dataName+' must be an encoded object id';
  return this.every(utils.isObjectId64, 400, errMessage)(args);
};
RequestData.prototype.castAsArray = function (key) {
  var dataType = this.dataType;
  return function (req, res, next) {
    var val = req[dataType][key];
    if (utils.exists(val)) {
      req[dataType][key] = Array.isArray(val) ? val : [val];
    }
    else {
      req[dataType][key] = [];
    }
    next();
  };
};
RequestData.prototype.castAsMongoQuery = function () {
  var dataType = this.dataType;
  return function (req, res, next) {
    var requestData = req[dataType];
    Object.keys(requestData).forEach(function (key) {
      if (Array.isArray(requestData[key])) {
        requestData[key] = { $in: requestData[key] };
      }
    });
    next();
  };
};
RequestData.prototype.if = function (keys /*, middlewares */) {
  var middlewares = Array.prototype.slice.call(arguments, 1);
  keys = Array.isArray(keys) ? keys : [keys];
  return ternary(this.isTrue.apply(this, keys),
    series.apply(this, middlewares),
    utils.next);
};
RequestData.prototype.unless = function (keys /*, middlewares */) {
  var middlewares = Array.prototype.slice.call(arguments, 1);
  keys = Array.isArray(keys) ? keys : [keys];
  return ternary(this.isTrue.apply(this, keys),
    utils.next,
    series.apply(this, middlewares));
};
RequestData.prototype.ifExists = function (keys /*, middlewares */) {
  var middlewares = Array.prototype.slice.call(arguments, 1);
  keys = Array.isArray(keys) ? keys : [keys];
  return ternary(this.require.apply(this, keys),
    series.apply(this, middlewares),
    utils.next);
};
RequestData.prototype.unlessExists = function (keys /*, middlewares */) {
  var middlewares = Array.prototype.slice.call(arguments, 1);
  keys = Array.isArray(keys) ? keys : [keys];
  return ternary(this.require.apply(this, keys),
    utils.next,
    series.apply(this, middlewares));
};
RequestData.prototype.strToBoolean = function (/* keys */) {
  var keys = Array.isArray(arguments[0]) ? arguments[0] : Array.prototype.slice.call(arguments);
  var dataType = this.dataType;
  return function (req, res, next) {
    keys.forEach(function (key) {
      var val = req[dataType][key];
      if (utils.exists(val)) {
        req[dataType][key] = utils.strToBoolean(val);
      }
    });
    next();
  };
};
RequestData.prototype.ifOneExists = function (keys /*, middlewares */) {
  var middlewares = Array.prototype.slice.call(arguments, 1);
  keys = Array.isArray(keys) ? keys : [keys];
  return ternary(this.requireOne.apply(this, keys),
    series.apply(utils, middlewares),
    utils.next);
};
RequestData.prototype.replaceMeWithMyId = function (key) {
  var dataType = this.dataType;
  return function (req, res, next) {
    if (req[dataType][key] === 'me') {
      req[dataType][key] = req.user_id;
    }
    next();
  };
};
RequestData.prototype.setFromQuery = setFrom('query');
RequestData.prototype.setFromBody = setFrom('body');
RequestData.prototype.setFromParams = setFrom('params');
RequestData.prototype.set = function (key, fromKeyPath) {
  var dataType = this.dataType;
  if (typeof key === 'string') {
    return function (req, res, next) {
      var value = (typeof fromKeyPath === 'function') ?
        fromKeyPath() : utils.replacePlaceholders(req, fromKeyPath);
      req[dataType][key] = value;
      next();
    };
  }
  else {
    var obj = key;
    var tasks = Object.keys(obj).map(function (key) {
      return this.set(key, obj[key]);
    });
    return series(tasks);
  }
};
RequestData.prototype.unset = function (key) {
  var dataType = this.dataType;
  return function (req, res, next) {
    delete req[dataType][key];
    next();
  };
};
RequestData.prototype.setDefault = function (key, val) {
  var dataType = this.dataType;
  return function (req, res, next) {
    var existing = req[dataType][key];
    req[dataType][key] = utils.exists(existing) ? existing : val;
    next();
  };
};
RequestData.prototype.max = function (key, max) {
  var dataType = this.dataType;
  return function (req, res, next) {
    req[dataType][key] = req[dataType][key] > max ? max : req[dataType][key];
    next();
  };
};
RequestData.prototype.allowValues = function (key, vals, required) {
  var dataType = this.dataType;
  var self = this;
  return function (req, res, next) {
    var valExists = utils.exists(req[dataType][key]);
    var isAllowed = ~vals.indexOf(req[dataType][key]);
    if ((required && !isAllowed) || (!required && valExists && !isAllowed)) {
      var valsStr = utils.arrayToString(vals, 'or', '.');
      return next(error(400, '"'+key+'" '+self.dataName+' must be '+valsStr));
    }
    next();
  };
};
function setFrom (dataType) {
  return function (selfDatakey, dataKey) {
    var self = this;
    return function (req, res, next) {
      req[self.dataType] = req[self.dataType] || {};
      req[self.dataType][selfDatakey] = req[dataType][dataKey];
      next();
    };
  };
}
