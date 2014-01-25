var _ = require('lodash');
var async = require('async');
var utils = require('./utils');
var series = utils.series;
function getModelMiddlewareClass() {
  var MongooseModelMiddleware = function () {};
  MongooseModelMiddleware.prototype = {}; // placeholder for the bound mongoose extended methods

  var ModelMiddleware = function (Model) {
    var modelName = Model.modelName.toLowerCase();
    this.Model = Model;
    this.key = utils.singularize(modelName);
    this.pluralKey = modelName;
    this.extendModel();
    this.setBoundProto();
    this.super = Object.getPrototypeOf(this);
  };
  ModelMiddleware.prototype = new MongooseModelMiddleware();
  _(ModelMiddleware.prototype).extend({
    extendModel: function () {
      var self = this;
      var parentProto = Object.getPrototypeOf(Object.getPrototypeOf(this));
      var Model = this.Model;
      var staticMethods = Object.keys(Model.schema.statics);
      var protoMethods = Object.keys(Object.getPrototypeOf(Model));
      var methods = protoMethods.concat(staticMethods);
      methods.forEach(function (method) {
        parentProto[method] = function (/*args*/) {
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
      parentProto.dbCallback = function (req, next) {
        var self = this;
        return req.domain.intercept(function (data) {
          var key = Array.isArray(data) ? self.pluralKey : self.key;
          req[key] = data;
          next();
        });
      };
      this.extendModelInstance();
    },
    extendModelInstance: function () {
      var model = new this.Model();
      var modelProto = Object.getPrototypeOf(model);
      this.model = {};
      this.models = {};
      var self = this;
      Object.keys(modelProto).forEach(function (method) {
        self.model[method] = function (/*args*/) {
          var args = Array.prototype.slice.call(arguments);
          return function (req, res, next) {
            var localArgs = utils.replacePlaceholders(req, args);
            localArgs.push(self.dbCallback(req, next));
            var model = req[self.key];
            req.domain.run(function () {
              model[method].apply(model, localArgs);
            });
            req.lastQuery = localArgs[0];
          };
        };
        self.models[method] = function (/*args*/) {
          var args = Array.prototype.slice.call(arguments);
          return function (req, res, next) {
            var localArgs = utils.replacePlaceholders(req, args);
            var models = req[self.pluralKey];
            req.domain.run(function () {
              async.map(models, function (model, cb) {
                var methodArgs = localArgs.concat(cb); // new array
                model[method].apply(model, methodArgs);
              }, self.dbCallback(req, next));
            });
            req.lastQuery = localArgs[0];
          };
        };
      });
    },
    setBoundProto: function () {
      var proto = Object.getPrototypeOf(this);
      _(proto).extend(getBoundPrototype(this));
      proto.super = Object.getPrototypeOf(proto);
    }
  });
  function getBoundPrototype (self) {
    return {
      findConflict: function (query) {
        return series(
          self.findOne(query, { _id:1 }),
          self.checkConflict
        );
      },
      create: function (data) {
        return function (req, res, next) {
          var localData = utils.replacePlaceholders(req, data);
          res.code = 201;
          req[self.key] = new self.Model(localData);
          next();
        };
      },
      set: function (data) {
        return function (req, res, next) {
          var localData = utils.replacePlaceholders(req, data);
          req[self.key].set(localData);
          next();
        };
      },
      save: function (req, res, next) {
        req[self.key].save(req.domain.intercept(function (model) {
          req[self.key] = model;
          next();
        }));
      },
      respond: function (req, res, next) {
        var plural = self.pluralKey;
        var key = self.key;
        var val = req[key];
        req[key] = (val && val.toJSON) ? val.toJSON() : val;
        if (!req[key]) {
          if (req[plural]) {
            self.respondList(req, res, next);
          }
          else {
            self.checkFound(req, res, next);
          }
        }
        else {
          res.json(res.code || 200, req[key]);
        }
      },
      respondList: function (req, res, next) {
        var key = self.pluralKey;
        var arr = req[key];
        req[key] = (!Array.isArray(arr)) ?
          arr :
          arr.map(function (item) {
            return (item && item.toJSON) ? item.toJSON() : item;
          });
        res.json(res.code || 200, req[key]);
      },
      checkFound: function (req, res, next) {
        utils.require(self.key)(req, res, next);
      },
      checkConflict: function (req, res, next) {
        var paramId = req.params && (req.params.id || req.params[self.key+'Id']);
        var conflictId = req[self.key] && req[self.key]._id;
        if (paramId && utils.equalObjectIds(paramId, conflictId)) {
          return next(); // ignore the conflict if it is itself
        }
        var keys = Object.keys(req.lastQuery).join(',');
        var message = [self.key, 'with', keys, 'already exists'].join(' ');
        utils.conflict(self.key, message)(req, res, next);
      }
    };
  }
  return ModelMiddleware;
}
module.exports = function createModelMiddleware (MongooseModel, extend) {
  var ModelMiddleware = getModelMiddlewareClass();
  var modelMiddleware = new ModelMiddleware(MongooseModel);
  var boundExtend = {};
  Object.keys(extend || {}).forEach(function (method) {
    boundExtend[method] = extend[method].bind(modelMiddleware);
  });
  _(modelMiddleware).extend(boundExtend);
  return modelMiddleware;
};