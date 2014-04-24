var _ = require('lodash');
var express = require('express');
var app = module.exports = express();
// var mw = require('dat-middleware');

var body = require('middleware/body');
var me = require('middleware/me');
// var params = require('middleware/params');
var project = require('middleware/projects');
var contexts = require('middleware/contexts');

// var Project = require('models/projects');
// var Context = require('models/contexts');

// list all projects
// TODO: do we need this?
app.get('/',
  function (req, res, next) { res.send(501); });

// create a new project!
app.post('/',
  me.isRegistered,
  body.require('name', 'contexts'),
  contexts.checkBodyContext('name', 'dockerfile'),
  project.create({
    name: 'body.name',
    owner: 'user_id',
    description: 'body.description'
  }),
  contexts.createContexts,
  project.copyContexts,
  project.respond);

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
