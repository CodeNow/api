'use strict';

var extend = require('extend');
var omit = require('101/omit');
var isObject = require('101/is-object');
var async = require('async');
var inflect = require('i')();
var utils = require('middlewares/utils');
var flow = require('middleware-flow');
var checkFound = require('middlewares/check-found');
var camelize = function (str) {
  return inflect.camelize(inflect.underscore(str), false);
};

function getModelMiddlewareClass() {
  var MongooseModelMiddleware = function () {};
  MongooseModelMiddleware.prototype = {}; // placeholder for the bound mongoose extended methods

  var ModelMiddleware = function (Model, key) {
    if (typeof Model === 'string') {
      key = Model;
      Model = null;
    }
    if (Model) {
      Model = Model;
      var modelName = Model.modelName;
      this.Model = Model;
      this.key = key || camelize(utils.singularize(modelName));
      this.pluralKey = utils.pluralize(this.key);
      this.extendModel();
    }
    else {
      this.key = key;
      this.pluralKey = utils.pluralize(this.key);
    }
    this.setBoundProto();
    this.super = Object.getPrototypeOf(this);
  };
  ModelMiddleware.prototype = new MongooseModelMiddleware();
  extend(ModelMiddleware.prototype, {
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
            var keyOverride = method === 'update' ? 'numberUpdated' : null;
            localArgs.push(self.dbCallback(req, next, keyOverride));
            var Model = self.Model;
            req.domain.run(function () {
              Model[method].apply(Model, localArgs);
            });
            req[self.key+'LastQuery'] = localArgs[0];
          };
        };
        parentProto[method].name = method;
      });
      parentProto.dbCallback = function (req, next, keyOverride) {
        var self = this;
        return function (err, data) {
          if (err) {
            next(err);
          }
          else {
            var key = keyOverride || Array.isArray(data) ? self.pluralKey : self.key;
            req[key] = data;
            next();
          }
        };
      };
      this.extendModelInstance();
    },
    extendModelInstance: function () {
      var model = new this.Model();
      function getKeys () {
        var modelProto = Object.getPrototypeOf(model);
        var modelProtoProto = Object.getPrototypeOf(modelProto);
        var modelProtoProtoProto = Object.getPrototypeOf(modelProtoProto);
        var modelProtoProtoProtoProto = Object.getPrototypeOf(modelProtoProtoProto);
        var modelProtoProtoProtoProtoProto = Object.getPrototypeOf(modelProtoProtoProtoProto);
        return Object.keys(model)
          .concat(Object.keys(modelProto))
          .concat(Object.keys(modelProtoProto))
          .concat(Object.keys(modelProtoProtoProto))
          .concat(Object.keys(modelProtoProtoProtoProto))
          .concat(Object.keys(modelProtoProtoProtoProtoProto));
      }
      this.model = {};
      this.models = {};
      var self = this;
      var modelMethodNames = getKeys();
      modelMethodNames.forEach(function (method) {
        self.model[method] = function (/*args*/) {
          var args = Array.prototype.slice.call(arguments);
          return function (req, res, next) {
            var localArgs = utils.replacePlaceholders(req, args);
            var keyOverride = method === 'update' ? 'numberUpdated' : null;
            localArgs.push(self.dbCallback(req, next, keyOverride));
            var model = req[self.key];
            req.domain.run(function () {
              if (!model) {
                throw new Error(self.key+' is undefined');
              }
              else if (!model[method]) {
                throw new Error(model+'('+self.key+') has no method "'+method+'"');
              }
              model[method].apply(model, localArgs);
            });
            req[self.key+'LastQuery'] = localArgs[0];
          };
        };
        self.model[method].name = method;
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
        self.models[method].name = method;
      });
    },
    setBoundProto: function () {
      var proto = Object.getPrototypeOf(this);
      extend(proto, getBoundPrototype(this));
      proto.super = Object.getPrototypeOf(proto);
    }
  });
  function getBoundPrototype (self) {
    return {
      findPage: function (queryArg, fieldsArg) {
        var self = this;
        return function (req, res, next) {
          var query = utils.replacePlaceholders(req, queryArg);
          var fields = utils.replacePlaceholders(req, fieldsArg);
          // paging starts at 0
          var limit = query.limit;
          var opts = {
            limit: limit,
            skip: query.page*limit,
            sort: query.sort
          };
          query = omit(query, ['sort', 'page', 'limit']);
          var Model = self.Model;
          async.parallel({
            count: Model.count.bind(Model, query),
            find: Model.find.bind(Model, query, fields, opts)
          },
          function (err, results) {
            if (err) { return next(err); }
            req.paging = {
              lastPage: Math.ceil(results.count / limit) - 1
            };
            self.dbCallback(req, next)(null, results.find);
          });
        };
      },
      findConflict: function (query) {
        return flow.series(
          self.findOne(query, { _id:1 }),
          self.checkConflict
        );
      },
      create: function (data) {
        return function (req, res, next) {
          var localData = utils.replacePlaceholders(req, data) || {};
          req[self.key] = new self.Model(localData);
          next();
        };
      },
      respond: function (req, res, next) {
        var pluralKey = self.pluralKey;
        var key = self.key;
        var val = req[key];
        req[key] = (val && val.toJSON) ? val.toJSON() : val;
        if (res.code) {
          res.status(res.code);
        }
        if (req[key]) {
          res.json(req[key]);
        }
        else if (req[pluralKey]) {
          self.respondList(req, res, next);
        }
        else {
          checkFound(self.key)(req, res, next);
        }
      },
      respondList: function (req, res) {
        var pluralKey = self.pluralKey;
        var arr = req[pluralKey].paging ?
          req[pluralKey].data :
          req[pluralKey];
        arr.forEach(function (item, i) {
          arr[i] = (item && item.toJSON) ? item.toJSON() : item;
        });
        res.json(res.code || 200, req[pluralKey]);
      },
      checkConflict: function (req, res, next) {
        var paramId = req.params && (req.params.id || req.params[self.key+'Id']);
        var conflictId = req[self.key] && req[self.key]._id;
        if (paramId && utils.equalObjectIds(paramId, conflictId)) {
          return next(); // ignore the conflict if it is itself
        }
        var keys = getLastQueryKeys();
        // TODO fix this message for $or queries
        var message = keys ?
          [self.key, 'with', keys, 'already exists'].join(' ') :
          self.key + ' already exists';
        utils.conflict(self.key, message)(req, res, next);
        function getLastQueryKeys() {
          var lastQuery = req[self.key+'LastQuery'] || {};
          var keys;
          if (utils.isObjectId(lastQuery)) {
            keys = ['_id'];
          }
          else if (isObject(lastQuery)) {
            keys = Object.keys(lastQuery).join(',');
          }
          else {
            keys = null;
          }
          return keys;
        }
      }
    };
  }
  return ModelMiddleware;
}
module.exports = function createMongooseMiddleware (keyOrModel, extendMethods, key) {
  var ModelMiddleware = getModelMiddlewareClass();
  var modelMiddleware = new ModelMiddleware(keyOrModel, key);
  var boundExtend = {};
  Object.keys(extendMethods || {}).forEach(function (method) {
    if (typeof extendMethods[method] === 'function') {
      boundExtend[method] = extendMethods[method].bind(modelMiddleware);
    }
  });
  extend(modelMiddleware, boundExtend);
  return modelMiddleware;
};
