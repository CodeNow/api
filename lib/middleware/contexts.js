'use strict';

var createMongooseMiddleware = require('./createMongooseMiddleware');
var Context = require('models/contexts');

var _ = require('lodash');
var async = require('async');
var debug = require('debug')('runnableApi:context:middleware');
var keypather = require('keypather')();

module.exports = createMongooseMiddleware(Context, {
  createContexts: function (optionKeys) {
    return function (req, res, next) {
      debug('creating contexts');
      var options = {};
      Object.keys(optionKeys).forEach(function (key) {
        options[key] = keypather.get(req, optionKeys[key]);
      });
      var contexts = req.body.contexts;

      async.map(contexts,
        function (context, callback) {
          var data = _.pick(context, ['name', 'displayName', 'description', 'parent']);
          _.extend(data, options);
          var newContext = new Context(data);
          newContext.versions.push({});
          async.series([
            newContext.uploadDockerfile.bind(newContext, context.dockerfile),
            newContext.createSourceDirectory.bind(newContext)
          ], function (err, res) {
            if (err) {
              return callback(err);
            }
            // FIXME: these can be methods on a context for sure
            if (Array.isArray(res[0]) && res[0].length === 2) {
              newContext.dockerfileVersions.push({
                Key: res[0][1].Key,
                ETag: res[0][1].ETag,
                VersionId: res[0][1].VersionId
              });
            }
            if (Array.isArray(res[1]) && res[1].length === 2) {
              newContext.versions[0].files.push({
                Key: res[1][1].Key,
                ETag: res[1][1].ETag,
                VersionId: res[1][1].VersionId
              });
            }
            callback(null, newContext);
          });
        },
        function (err, contexts) {
          if (err) {
            return next(err);
          }
          debug('done creating contexts');
          req.contexts = contexts;
          next(err, contexts);
        });
    };
  },
  respond: function (req, res, next) {
    var self = this;
    var model = req[this.key];
    if (model) {
      if (model.returnJSON) {
        model.returnJSON(req.domain.intercept(function (json) {
          req[self.key] = json;
          self.super.respond(req, res, next);
        }));
      }
      else {
        self.super.respond(req, res, next);
      }
    }
    else if (req[this.pluralKey]) {
      this.respondList(req, res, next);
    }
    else {
      this.checkFound(req, res, next);
    }
  },
  respondFileList: function (req, res) {
    res.json(200, req.data);
  }
});
