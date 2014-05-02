var express = require('express');
var app = module.exports = express();
var flow = require('middleware-flow');
var mw = require('dat-middleware');

var contexts = require('middleware/contexts');
var docklet = require('middleware/docklet');
var harbourmaster = require('middleware/harbourmaster');
var me = require('middleware/me');
var project = require('middleware/projects');

var utils = require('middleware/utils');

// list all projects
app.get('/',
  // FIXME: we are going to need this - replaces image (and image feed)
  function (req, res, next) { res.send(501); });

// create a new project!
// create a new project FROM an existing project!
app.post('/',
  me.isRegistered,
  mw.query().if('from').then(
    project.findByIds('query.from'),
    project.checkFound,
    flow.or(
      project.checkPublic,
      me.isOwnerOf('project'),
      me.isModerator),
    project.copyActionUpdateName),
  mw.body().set('owner', 'user_id'),
  mw.body('owner', 'name', 'contexts').require(),
  // FIXME: do we need/want any name validation here?
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
  // TODO: projects will be all private soon
  project.model.set({ public: true }),
  project.model.save(),
  // FIXME: we don't really want to respond with just the projects...
  // build containers for each context
  // attach containers to project for response?
  project.respond);

// get a project by id
app.get('/:id',
  project.findById('params.id'),
  project.checkFound,
  flow.or(
    project.checkPublic,
    me.isOwnerOf('project'),
    me.isModerator),
  project.respond);

// build docker images for an entire project
app.post('/:id/build',
  project.findById('params.id'),
  project.checkFound,
  project.pullContexts,
  // use docklet to find a docker to work with
  docklet.create(),
  docklet.model.findDock(),
  // build the docker images from the project!
  project.buildFullProject,
  // req.data.imageIds are the new built images
  // FIXME: add harbourmaster!
  // use harbormaster to build containers to send back
  // return a success with connections to the new containers
  utils.code(201),
  function (req, res, next) { res.json(res.code, req.data.imageIds); });

app.del('/:id',
  project.findById('params.id', { _id: 1, owner: 1 }),
  project.checkFound,
  flow.or(
    me.isOwnerOf('project'),
    me.isModerator),
  project.removeById('params.id'),
  utils.respondNoContent);
