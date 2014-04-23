var express = require('express');
var app = module.exports = express();

var async = require('async');
var body = require('middleware/body');
var me = require('middleware/me');
var params = require('middleware/params');
var project = require('middleware/projects');

var aws = require('aws-sdk');
var configs = require('configs');
aws.config.update({
  accessKeyId: configs.S3.auth.accessKey,
  secretAccessKey: configs.S3.auth.secretKey
});
var s3 = new aws.S3();
var url = require('url');
var join = require('path').join;
var error = require('error');
var Project = require('models/projects');
var Context = require('models/contexts');

// list all projects
// TODO: do we need this?
app.get('/',
  function (req, res, next) { res.send(501); });

// get a project by id
app.get('/:id',
  project.findById('params.id'),
  project.respond);

// build docker images for an entire project
app.post('/:id/build',
  project.findById('params.id'),
  // build the docker images
  // increment the version
  // return a success with connections to the new containers?
  function (req, res, next) { res.send(501); });

// create a new project!
app.post('/',
  me.isRegistered,
  body.require('name', 'contexts'),
  function (req, res, next) {
    var field, context;
    var requiredContext = [
      'name',
      'dockerfile',
    ];
/* jshint ignore:start */
    for (var i in req.body.contexts) {
      context = req.body.contexts[i];
      for (var j in requiredContext) {
        field = requiredContext[j];
        if (!context[field]) {
          return next(error(400, 'missing field: ' + field + ' on context ' + i));
        }
      }
    }
/* jshint ignore:end */
    next();
  },
  function (req, res, next) {
    var tasks = [];
    req.contexts = [];
    var contextIds = [];
    // create each of the contexts
    for (var i in req.body.contexts) {
      context = req.body.contexts[i];
      var newContextData = {
        name: context.name,
        owner: req.user_id,
        displayName: context.displayName || context.name,
        description: context.description,
        version: 'v0'
      };
      // do not save yet. wait until all are created.
      var newContext = new Context(newContextData);
      tasks.push(newContext.uploadDockerfile.bind(newContext, context.dockerfile));
      tasks.push(newContext.createSourceDirectory.bind(newContext));
      tasks.push(newContext.save.bind(newContext));

      contextIds.push({
        context: newContext._id,
        version: 'v0'
      });
      req.contexts.push(newContext);
    }

    // create the new project
    var newProjectData = {
      name: req.body.name,
      contexts: contextIds,
      owner: req.user_id,
      parent: null,
      description: req.body.description
    };
    req.project = new Project(newProjectData);
    tasks.push(req.project.save.bind(req.project));
    async.series(tasks, next);
  },
  project.respond
);
