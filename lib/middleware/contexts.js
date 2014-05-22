'use strict';

var createMongooseMiddleware = require('./createMongooseMiddleware');
var Context = require('models/contexts');

var _ = require('lodash');
var async = require('async');
var debug = require('debug')('runnableApi:context:middleware');
var keypather = require('keypather')();
var flow = require('middleware-flow');
var mw = require('dat-middleware');

module.exports = createMongooseMiddleware(Context, {
  checkValidContexts: function (/* keys */) {
    var keys = Array.prototype.slice.call(arguments);
    var repoRegex = /^[a-z0-9-_.]+$/;
    return flow.series(
      mw.body('contexts').require()
        .then(checkBodyContexts)
        .else(
          mw.body('name', 'dockerfile', 'project').require(),
          mw.body('name').matches(repoRegex)));

    function checkBodyContexts (req, res, next) {
      /* TODO: convert this into some awesome middleware, with array functions.
       * e.g.: mw.body('contexts').each(keys).require(),
       *       mw.body('contexts').each('name').match(repoRegex)
       */
      var contexts = req.body.contexts ? req.body.contexts : [req.body];
      var err;
      contexts.forEach(function (context) {
        // fun fact: _'s forEach will break if a false is returned! (Array.forEach does not)
        _.forEach(keys, checkContextForKeys(context));
      });
      next(err);

      function checkContextForKeys (context) {
        return function (field) {
          if (field === 'name' && !repoRegex.test(context[field])) {
            err = mw.Boom.badRequest('body parameter "body.context.name" ' +
              'should match /^[a-z0-9-_.]+$/');
            return false;
          }
          if (!context[field]) {
            err = mw.Boom.badRequest('body parameter "body.context.' +
              field + '" is required');
            return false;
          }
        };
      }
    }
  },
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
                key: res[0][1].key,
                etag: res[0][1].ETag,
                version: res[0][1].VersionId
              });
            }
            if (Array.isArray(res[1]) && res[1].length === 2) {
              newContext.versions[0].files.push({
                key: res[1][1].key,
                etag: res[1][1].ETag,
                version: res[1][1].VersionId
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
  getFileList: function (key) {
    // FIXME: return the file tree from version.files
    return function (req, res, next) {
      var prefix = keypather.get(req, key);
      req.context.listResources(prefix, function (err, data) {
        if (!req.data) {
          req.data = {};
        }
        req.data.files = data;
        next(err, req.context);
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
