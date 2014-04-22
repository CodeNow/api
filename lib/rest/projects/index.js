var express = require('express');
var app = module.exports = express();
var me = require('middleware/me');

var Project = require('models/projects');
var Context = require('models/contexts');

/* jshint ignore:start */
app.post('/',
  me.isRegistered,
  function (req, res, next) {
    var field, error, context;
    var requiredProject = [
      'name',
      'contexts'
    ];
    var requiredContext = [
      'name',
      'dockerfile',
    ];
    for (var i in requiredProject) {
      field = requiredProject[i];
      if (!req.body[field]) {
        error = 'missing field: ' + field;
        res.send(400, error);
        return next(error);
      }
    }
    for (i in req.body.contexts) {
      context = req.body.contexts[i];
      for (var j in requiredContext) {
        field = requiredContext[j];
        if (!context[field]) {
          error = 'missing field: ' + field + ' on context ' + i;
          res.send(400, error);
          return next(error);
        }
      }
    }
    req.contexts = [];
    for (i in req.body.contexts) {
      context = req.body.contexts[i];
      var newContextData = {
        name: context.name,
        dockerfile: context.dockerfile,
        owner: req.user_id,
        displayName: context.displayName || context.name,
        description: context.description
      };
      // do not save yet. wait until all are created.
      req.contexts.push(new Context(newContextData));
    }
    // save them all!
    var contextIds = [];
    for (i in req.contexts) {
      req.contexts[i].save();
      contextIds.push(req.contexts[i]._id);
    }

    var newProjectData = {
      name: req.body.name,
      contexts: contextIds,
      owner: req.user_id,
      parent: null,
      description: req.body.description
    };
    req.project = new Project(newProjectData);
    req.project.save();
    res.json(201, req.project);
  }
);
/* jshint ignore:end */
