var _ = require('lodash');
var utils = require('./utils');
var series = utils.series;

var ModelMiddleware = function (Model) {
  var modelName = Model.modelName.toLowerCase();
  this.Model = Model;
  this.key = utils.singularize(modelName);
  this.pluralKey = modelName;
  this.super = ModelMiddleware.prototype;
  this.extendModel();
  this.bindAll();
};
ModelMiddleware.prototype = {
  extendModel: function () {
    var self = this;
    var Model = this.Model;
    var staticMethods = Object.keys(Model.schema.statics);
    var protoMethods = Object.keys(Object.getPrototypeOf(Model));
    var methods = _.difference(
      protoMethods.concat(staticMethods),
      Object.keys(Object.getPrototypeOf(this)) // dont overwrite methods defined below
    );
    methods.forEach(function (method) {
      self[method] = function (/*args*/) {
        var args = Array.prototype.slice.call(arguments);
        return function (req, res, next) {
          var localArgs = utils.replacePlaceholders(req, args);
          localArgs.push(self.dbCallback(req, next));
          var Model = self.Model;
          req.domain.run(function () {
            Model[method].apply(Model, localArgs);
          });
          req.lastQuery = localArgs[0];
        };
      };
    });
  },
  bindAll: function () {
    var self = this;
    var methodKeys = Object
      .keys(Object.getPrototypeOf(this))
      .filter(function (key) {
        return typeof self[key] === 'function' &&
          !isException(key);
      })
      .forEach(function (key) {
        self[key] = self[key].bind(self);
      });
    function isException (key) {
      return ~['Model', 'bindAll'].indexOf(key);
    }
  },
  dbCallback: function (req, next) {
    var self = this;
    return req.domain.intercept(function (data) {
      var key = Array.isArray(data) ? self.pluralKey : self.key;
      req[key] = data;
      next();
    });
  },
  //
  findConflict: function (query) {
    return series(
      this.findOne(query),
      this.checkConflict
    );
  },
  create: function (data) {
    var self = this;
    return function (req, res, next) {
      var localData = utils.replacePlaceholders(req, data);
      res.code = 201;
      req[self.key] = new self.Model(localData);
      next();
    };
  },
  set: function (data) {
    var self = this;
    return function (req, res, next) {
      var localData = utils.replacePlaceholders(req, data);
      req[this.key].set(localData);
      next();
    };
  },
  update: function (data) {
    series(
      this.set(data),
      this.save
    )(req, res, next);
  },
  save: function (req, res, next) {
    req[this.key].save(req.domain.intercept(function (model) {
      req[this.key] = model;
      next();
    }));
  },
  respond: function (req, res, next) {
    var plural = this.pluralKey;
    var key = this.key;
    var val = req[key];
    req[key] = (val && val.toJSON) ? val.toJSON() : val;
    if (!req[key]) {
      if (req[plural]) {
        this.respondList(req, res, next);
      }
      else {
        this.checkFound(req, res, next);
      }
    }
    else {
      res.json(res.code || 200, req[key]);
    }
  },
  respondList: function (req, res, next) {
    var key = this.pluralKey;
    var arr = req[key];
    req[key] = (!Array.isArray(arr)) ?
      arr :
      arr.map(function (item) {
        return (item && item.toJSON) ? item.toJSON() : item;
      });
    res.json(res.code || 200, req[key]);
  },
  checkFound: function (req, res, next) {
    utils.require(this.key)(req, res, next);
  },
  checkConflict: function (req, res, next) {
    var keys = Object.keys(req.lastQuery).join(',');
    var message = [this.key, 'with', keys, 'already exists'].join(' ');
    utils.conflict(this.key, message)(req, res, next);
  }
};

module.exports = function createModelMiddleware (MongooseModel, prototype) {
  var Middleware = function () {
    this.bindAll.call(this);
  };
  Middleware.prototype = new ModelMiddleware(MongooseModel);
  _(Middleware.prototype).extend(prototype);

  return new Middleware();
};