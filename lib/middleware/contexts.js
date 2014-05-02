'use strict';

var createMongooseMiddleware = require('./createMongooseMiddleware');
var Context = require('models/contexts');

var _ = require('lodash');
var async = require('async');
var keypather = require('keypather')();
var flow = require('middleware-flow');
var mw = require('dat-middleware');

module.exports = createMongooseMiddleware(Context, {
  checkValidContexts: function (/* keys */) {
    var keys = Array.prototype.slice.call(arguments);
    var repoRegex = /^[a-z0-9-_.]+$/;
    return flow.series(
      mw.body().ifExists('contexts')
        .then(checkBodyContexts)
        .else(
          mw.body('name', 'dockerfile', 'project').require(),
          mw.body('name').matches(repoRegex)));

    function checkBodyContexts (req, res, next) {
      /* TODO: convert this into some awesome middleware, with array functions.
       * e.g.: mw.body('contexts').each(keys).require(),
       *       mw.body('contexts').each('name').match(repoRegex)
       */
      var field, context;
      var contexts = req.body.contexts ? req.body.contexts : [req.body];
      for (var i in contexts) {
        context = contexts[i];
        for (var j in keys) {
          field = keys[j];
          /* jshint ignore:start */
          if (field === 'name' && !repoRegex.test(context[field])) {
            return next(mw.Boom.badRequest('body parameter "body.context.name" should match /^[a-z0-9-_.]+$/'));
          }
          if (!context[field]) {
            return next(mw.Boom.badRequest('body parameter "body.context.' + field + '" is required'));
          }
          /* jshint ignore:end */
        }
      }
      next();
    }
  },
  createContexts: function (req, res, next) {
    var user_id = req.user_id;
    var contexts = req.body.contexts;

    async.map(contexts,
      function (context, callback) {
        var data = _.pick(context, ['name', 'displayName', 'description', 'parent']);
        _.extend(data, { owner: user_id });
        var newContext = new Context(data);
        async.series([
          newContext.uploadDockerfile.bind(newContext, context.dockerfile),
          newContext.createSourceDirectory.bind(newContext),
          newContext.save.bind(newContext)
        ], function (err, res) {
          // use the res from the save (pop), shift for the object (obj, number)
          var c = res.pop();
          if (Array.isArray(c)) {
            c = c.shift();
          }
          callback(err, c);
        });
      },
      function (err, contexts) {
        req.contexts = contexts;
        next(err, contexts);
      });
  },
  getFileList: function (key) {
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
