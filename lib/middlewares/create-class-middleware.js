var keypather = require('keypather')();
var fno = require('fn-object');
var fnProxy = require('function-proxy');

var error = require('error');


module.exports = function (key, Model) {
  return new ClassMiddleware(key, Model);
};



function ClassMiddleware (key, Model) {
  this.key = key;
  this.Model = Model;
  var self = this;
  this.model = {};
  Object.keys(Model.prototype)
    .filter(valIsFunction(Model.prototype))
    .forEach(createMiddleware);

  function createMiddleware (method) {
    self.model[method] = function (/* args */) {
      var argKeys = Array.prototype.slice.call(arguments);
      return function (req, res, next) {
        var model = req[self.key];
        if (!model) {
          throw new Error('Model middleware\'s model was not created. Ex: mw.create(...)');
        }
        var args = argKeys.map(replacePlaceholders(req));
        args.push(createCallback(req, self.key + 'Result', next));
        model[method].apply(model, args);
      };
    };
  }
}

ClassMiddleware.prototype.create = function (/* args */) {
  var self = this;
  var argKeys = Array.prototype.slice.call(arguments);
  return function (req, res, next) {
    var args = argKeys.map(replacePlaceholders(req));
    args.unshift(self.Model); // yuck
    var Model = self.Model.bind.apply(self.Model, args);
    req[self.key] = new Model();
    next();
  };
};

function valIsFunction (obj) {
  return function (key) {
    return typeof obj[key] === 'function';
  };
}

function replacePlaceholders (req) {
  return function (arg) {
    if (isString(arg)) {
      return keypather.get(req, arg) || arg;
    }
    else if (Array.isArray(arg)) {
      return args.map(replacePlaceholders);
    }
    else if (isObject(arg)) {
      fno(arg).vals.map(function (val) {
        return replacePlaceholders(val);
      });
    }
    else { // keep
      return arg;
    }
  };
}

function createCallback (req, key, next) {
  // handles status errors, setting the key on req, and next
  return function (err, result) {
    if (err) { return next(err); }
    req[key] = result;
    next();
  };
}


// utils
function isString (v) {
  return typeof v === 'string';
}

function isObject (v) {
  return typeof v === 'object';
}

function last (v) {
  return v && v[v.length-1];
}
