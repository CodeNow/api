var createModelMiddleware = require('./createModelMiddleware');
var Project = require('models/projects');

var projects = module.exports = createModelMiddleware(Project, {
  copyContexts: function (req, res, next) {
    var project = req.project;
    project.contexts = req.contexts.map(function (context) {
      return { context: context._id, version: 'v0' };
    });
    project.save(function (err, res) {
      if (res.length) {
        project = res.shift();
      }
      next(err, project);
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
