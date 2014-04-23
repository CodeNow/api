var createModelMiddleware = require('./createModelMiddleware');
var Context = require('models/contexts');

var _ = require('lodash');
var async = require('async');
var error = require('error');

var contexts = module.exports = createModelMiddleware(Context, {
  checkBodyContext: function (/* keys */) {
    var keys = Array.prototype.slice.call(arguments);
    return function (req, res, next) {
      var field, context;
      var requiredContext = [
        'name',
        'dockerfile',
      ];
      for (var i in req.body.contexts) {
        context = req.body.contexts[i];
        for (var j in keys) {
          field = keys[j];
          /* jshint ignore:start */
          if (!context[field]) {
            return next(error(400, 'missing field: ' + field + ' on context ' + i));
          }
          /* jshint ignore:end */
        }
      }
      next();
    };
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
          var c = res.pop().shift();
          callback(err, c);
        });
      },
      function (err, contexts) {
        req.contexts = contexts;
        next(err, contexts);
      });
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
  }
});
