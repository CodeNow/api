/**
 * TODO: please write description for this module here
 * when you see this
 * @module lib/middlewares/create-class-middleware
 */
'use strict';

var empty = require('101/is-empty');
var exists = require('101/exists');
var fno = require('fn-object');
var isObject = require('101/is-object');
var isString = require('101/is-string');
var keypather = require('keypather')();

module.exports = function(Model, key) {
  return new ClassMiddleware(key, Model);
};

function ClassMiddleware(key, Model) {
  this.key = key;
  this.Model = Model;
  var self = this;
  this.model = {};

  var methodsToWrap = [];
  var currentObj = Model.prototype;
  while (Object.getPrototypeOf(currentObj)) {
    methodsToWrap = methodsToWrap.concat(Object.keys(currentObj));
    currentObj = Object.getPrototypeOf(currentObj);
  }
  methodsToWrap = methodsToWrap.reverse().concat(Object.keys(Model.prototype));

  methodsToWrap
    .filter(valIsFunction(Model.prototype))
    .forEach(createMiddleware);

  Object.keys(Model)
    .filter(valIsFunction(Model))
    .forEach(createStaticMiddleware);

  function createMiddleware(method) {
    self.model[method] = function( /* args */ ) {
      var argKeys = Array.prototype.slice.call(arguments);
      return function(req, res, next) {
        var model = req[self.key];
        if (!model) {
          throw new Error('Model middleware\'s model (' +
            self.key + ') was not created. Ex: mw.create(...)');
        }
        var args = argKeys.map(replacePlaceholders(req));
        args.push(createCallback(req, self.key + 'Result', next));
        if (!model) {
          throw new Error('Cannot call ' + method + ' of ' + self.key + ' (model is undefined)');
        } else if (!model[method]) {
          throw new Error('Cannot call ' + method + ' of ' + self.key + ' (method is undefined)');
        }
        model[method].apply(model, args);
      };
    };
    self.model[method].name = Model.name + '.model.' + method;
  }
  function createStaticMiddleware(method) {
    self[method] = function( /* args */ ) {
      var argKeys = Array.prototype.slice.call(arguments);
      return function(req, res, next) {
        var args = argKeys.map(replacePlaceholders(req));
        args.push(createCallback(req, self.key + 'Result', next));
        if (!self[method]) {
          throw new Error('Cannot call ' + method + ' of ' + self.key + ' (static method is undefined)');
        }
        Model[method].apply(self, args);
      };
    };
    self[method].name = Model.name + '.' + Model[method].name;
  }
}

/**
 * Create an instance of the wrapped model and attach to this.{key}
 * @return {Function} - middleware
 */
ClassMiddleware.prototype.create = function( /* args */ ) {
  var self = this;
  var argKeys = Array.prototype.slice.call(arguments);
  return function(req, res, next) {
    var args = argKeys.map(replacePlaceholders(req));
    args.unshift(self.Model); // yuck
    var Model = self.Model.bind.apply(self.Model, args);
    req[self.key] = new Model();
    next();
  };
};

function valIsFunction(obj) {
  return function(key) {
    return typeof obj[key] === 'function';
  };
}

function replacePlaceholders(req) {
  function handleStringArg(arg) {
    var value = (empty(arg)) ? arg : keypather.get(req, arg);
    return exists(value) ? value : arg;
  }
  return function(arg) {
    if (isString(arg)) {
      return handleStringArg(arg);
    } else if (Array.isArray(arg)) {
      return arg.map(replacePlaceholders(req));
    } else if (isObject(arg)) {
      return fno(arg).vals.map(function(val) {
        return replacePlaceholders(req)(val);
      }).val();
    } else { // keep
      return arg;
    }
  };
}

function createCallback(req, key, next) {
  // handles status errors, setting the key on req, and next
  return function(err, result) {
    if (err) {
      return next(err);
    }
    req[key] = result;
    next();
  };
}
