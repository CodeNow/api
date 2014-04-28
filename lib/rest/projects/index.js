var _ = require('lodash');
var express = require('express');
var app = module.exports = express();
var error = require('error');
var mw = require('dat-middleware');

// var body = require('middleware/body');
var contexts = require('middleware/contexts');
var me = require('middleware/me');
// var params = require('middleware/params');
var project = require('middleware/projects');
// var query = require('middleware/query');

// var Project = require('models/projects');
// var Context = require('models/contexts');

// list all projects
// TODO: do we need this?
app.get('/',
  function (req, res, next) { res.send(501); });

// create a new project!
// create a new project FROM an existing project!
app.post('/',
  me.isRegistered,
  mw.query().if('from').then(
    project.findById('query.from'),
    project.checkFound,
    project.copyActionUpdateName),
  mw.body().set('owner', 'user_id'),
  mw.body('owner', 'name', 'contexts').require(),
  mw.body('name').matches(/.*/),
  mw.query().if('from').then(mw.body('parent').require()),
  contexts.checkValidContexts('name', 'dockerfile'),
  mw.params().set('contexts', 'body.contexts'),
  mw.body('name', 'description', 'parent', 'owner').pick(),
  project.create('body'),
  mw.body().set('contexts', 'params.contexts'),
  mw.params().unset('contexts'),
  contexts.createContexts,
  project.addContexts,
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
