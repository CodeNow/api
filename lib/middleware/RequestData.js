var _ = require('lodash');
var utils = require('middleware/utils');
var or = utils.or;
var ternary = utils.ternary;
var series = utils.series;

var RequestData = module.exports = function (dataType) {
  this.dataType = dataType;
  this.every = utils.every.bind(null, dataType);
  if (dataType === 'query') {
    this.dataName = 'query parameter';
  }
  else if (dataType === 'body') {
    this.dataName = 'body parameter';
  }
  else if (dataType === 'params') {
    this.dataName = 'url parameter';
  }
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
  var args = Array.prototype.slice.call(arguments);
  var errMessage = '"{{key}}" '+this.dataName+' is required';
  return this.every(utils.exists, 400, errMessage)(args);
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
RequestData.prototype.pick = function (/* keys */) {
  var keys = Array.prototype.slice.call(arguments);
  var dataType = this.dateType;
  return function (req, res, next) {
    req[dataType] = _.pick(req[dataType], keys);
    next();
  };
};
RequestData.prototype.instanceOf = function (key, Class) {
  var dataType = this.dateType;
  return function (req, res, next) {
    var lowercaseClassName = (Class.name || '').toLowerCase();
    var instanceofClass = req[dataType][key] instanceof Class;
    var typeofClassName = typeof req[dataType][key] === lowercaseClassName;
    if (!instanceofClass || !typeofClassName) {
      return next(error('"'+key+'" '+this.dataName+' must be an '+lowercaseClassName));
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
  var errMessage = '"{{key}}" '+this.dataName+' must be an array of object ids';
  return this.every(utils.isObjectIdArray, 400, errMessage)(args);
};
RequestData.prototype.isObjectId64 = function () {
  var args = Array.prototype.slice.call(arguments);
  var errMessage = '"{{key}}" '+this.dataName+' must be an encoded object id';
  return this.every(utils.isObjectId64, 400, errMessage)(args);
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
  return ternary(this.require.apply(this, keys),
    series.apply(this, middlewares),
    utils.next);
};
RequestData.prototype.ifOne = function (keys /*, middlewares */) {
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
      var value = utils.get(req, fromKeyPath);
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