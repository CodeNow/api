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
      req[dataType][key] = utils.decode(req[dataType][key]);
    });
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
  var first = arguments[0];
  var keys = Array.prototype.slice.call(arguments);
  var requires = keys.map(function (key) {
    return self.require(key);
  });
  var requireOne = or.apply(null, requires);
  var message = utils.arrayToString(keys, 'or', this.dataName+' is required');
  return ternary(requireOne,
      utils.next,
      utils.message(400, message));
};
RequestData.prototype.pick = function (/* keys */) {
  var keys = Array.prototype.slice.call(arguments);
  var dataType = this.dateType;
  return function (req, res, next) {
    req[dataType] = _.pick(req[dataType], keys);
    next();
  };
};
RequestData.prototype.isObjectId = function () {
  var args = Array.prototype.slice.call(arguments);
  var errMessage = '"{{key}}" '+this.dataName+' must be an object id';
  return this.every(utils.isObjectId, 400, errMessage)(args);
};
RequestData.prototype.isObjectId64 = function () {
  var args = Array.prototype.slice.call(arguments);
  var errMessage = '"{{key}}" '+this.dataName+' must be an encoded object id';
  return this.every(utils.isObjectId64, 400, errMessage)(args);
};
RequestData.prototype.castArray = function () {
  var keys = Array.prototype.slice.call(arguments);
  var dataType = this.dataType;
  return function (req, res, next) {
    keys.forEach(function (key) {
      var val = req[dataType][key];
      if (val && !Array.isArray(val)) {
        req[dataType][key] = [val];
      }
    });
    next();
  };
};
RequestData.prototype.if = function (key, middlewareTrue) {
  return utils.ternary(this.require(key), middlewareTrue, utils.next);
};
RequestData.prototype.setFromQuery = setFrom('query');
RequestData.prototype.setFromBody = setFrom('body');
RequestData.prototype.setFromParams = setFrom('params');
RequestData.prototype.set = function (key, fromKeyPath) {
  var dataType = this.dataType;
  if (typeof key === 'string') {
    return function (req, res, next) {
      var value = utils.get(fromKeyPath, req, res);
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