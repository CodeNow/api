var createModelMiddleware = require('./createModelMiddleware');
var Project = require('models/projects');

var error = require('error');

var projects = module.exports = createModelMiddleware(Project, {
  addContexts: function (req, res, next) {
    var project = req.project;
    var newContexts;
    if (req.contexts) {
      newContexts = req.contexts.map(function (context) {
        return { context: context._id, version: 'v0' };
      });
    } else if (req.context) {
      newContexts = [{ context: req.context._id, version: 'v0' }];
    } else {
      // no contexts to save!
      // throw a server error so we know to look!
      // also this allows us to not blame TJ... for once...
      return next(error(500, 'tried to add a context, did not find any'));
    }
    project.contexts.push.apply(project.contexts, newContexts);
    project.save(next);
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
