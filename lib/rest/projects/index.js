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

app.get('/',
  function (req, res, next) { res.send(501); });

app.get('/:id',
  project.findById('params.id'),
  project.respond);

app.post('/:id/build',
  project.findById('params.id')
  // build the docker images
  // increment the version
  // return a success with connections to the new containers?
  );

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
        version: 'v1'
      };
      // do not save yet. wait until all are created.
      var newContext = new Context(newContextData);
      var s3DockerFile = url.format({
        protocol: 's3:',
        slashes: true,
        host: configs.S3.contextResourceBucket,
        pathname: join(newContext._id.toString(), 'dockerfile', 'Dockerfile')
      });
      newContext.dockerfile = s3DockerFile;
      req.contexts.push(newContext);
      tasks.push(s3.putObject.bind(s3, {
        Bucket: configs.S3.contextResourceBucket,
        Key: join(newContext._id.toString(), 'dockerfile', 'Dockerfile'),
        Body: context.dockerfile
      }));
      tasks.push(s3.putObject.bind(s3, {
        Bucket: configs.S3.contextResourceBucket,
        Key: join(newContext._id.toString(), 'source/'),
        Body: null,
        ContentLength: 0
      }));
      tasks.push(req.contexts[i].save.bind(req.contexts[i]));
      contextIds.push({
        context: req.contexts[i]._id,
        version: 'v1'
      });
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

    async.parallel(tasks, next);
  },
  project.respond
);
