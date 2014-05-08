'use strict';

/**
 * Project API
 * @module rest/projects
 */

var express = require('express');
var app = module.exports = express();
var flow = require('middleware-flow');
var mw = require('dat-middleware');

var contexts = require('middleware/contexts');
var docklet = require('middleware/docklet');
// var harbourmaster = require('middleware/harbourmaster');
var me = require('middleware/me');
var project = require('middleware/projects');

var utils = require('middleware/utils');

// list all projects
app.get('/',
  // FIXME: we are going to need this - replaces image (and image feed)
  function (req, res) { res.send(501); });

/** Create a new {@link module:models/project Project}
 *  @param {object} [query]
 *  @param {ObjectId} [query.from] ID of the Project from which to copy
 *  @param {object} body
 *  @param {string} body.name Name of the project to create
 *  @param {array.string} body.contexts Array of contexts to create within the project
 *  @param {string} body.contexts[].name Name of the context to create
 *  @param {string} body.contexts[].dockerfile Contents of the Dockerfile for the context 
 *  @returns {object} The new project, along with containers for each context
 *  @event POST rest/projects/
 *  @memberof module:rest/projects */
app.post('/',
  me.isRegistered,
  mw.query().if('from').then(
    project.findByIds('query.from'),
    project.checkFound,
    flow.or(
      project.model.checkPublic(),
      me.isOwnerOf('project'),
      me.isModerator),
    project.copyActionUpdateName),
  mw.body().set('owner', 'user_id'),
  mw.body('owner', 'name', 'contexts').require(),
  // FIXME: do we need/want any name validation here?
  mw.body('name').matches(/.*/),
  mw.query().if('from')
    .then(mw.body('parent').require()),
  contexts.checkValidContexts('name', 'dockerfile'),
  mw.params().set('contexts', 'body.contexts'),
  mw.body('name', 'description', 'parent', 'owner').pick(),
  project.create('body'),
  project.model.createDefaultEnvironment(),
  mw.body().set('contexts', 'params.contexts'),
  mw.params().unset('contexts'),
  contexts.createContexts,
  // TODO: projects will be all private soon
  project.model.set({ public: true }),
  // FIXME: we don't really want to respond with just the projects...
  // use docklet to find a docker to work with
  docklet.create(),
  docklet.model.findDock(),
  // build the docker images from the project!
  project.buildFullProject,
  project.model.addContexts('contexts'),
  contexts.models.save(),
  project.model.save(),
  // attach containers to project for response?
  project.respond);

/** @returns {error} 405 - not allowed
 *  @event PUT rest/projects
 *  @memberof module:rest/projects */
app.put('/', function (req, res) { res.send(405); });
/** @returns {error} 405 - not allowed
 *  @event PATCH rest/projects
 *  @memberof module:rest/projects */
app.patch('/', function (req, res) { res.send(405); });
/** @returns {error} 405 - not allowed
 *  @event DELETE rest/projects
 *  @memberof module:rest/projects */
app.del('/', function (req, res) { res.send(405); });

/** Get a {@link module:models/project Project}
 *  @param {ObjectId} id ID of the project to fetch
 *  @param {ObjectId} [id=defaultEnvironment] ID of the environment with which to work
 *  @returns {object} The {@link module:models/project project}.
 *    What did you expect, a puppy?
 *  @event GET rest/projects/:id
 *  @memberof module:rest/projects */
app.get('/:id/:environment?',
  project.findById('params.id'),
  project.checkFound,
  flow.or(
    project.model.checkPublic(),
    me.isOwnerOf('project'),
    me.isModerator),
  // FIXME: deal with an environment!
  project.pullContexts('params.environment'),
  project.respond);

/** Create an environment on a {@link module:models/project Project}
 *  @param {ObjectId} id ID of the Project to which to add an environment
 *  @returns {object} The {@link module:models/project project}, and new environment
 *  @event POST rest/projects/:id
 *  @memberof module:rest/projects */
app.post('/:id',
  // FIXME
  function (req, res) { res.send(501); });

/** Update a {@link module:models/project Project}
 *  @param {ObjectId} id ID of the Project to update
 *  @returns {object} The {@link module:models/project project}
 *  @event PATCH rest/projects/:id
 *  @memberof module:rest/projects */
app.patch('/:id',
  // FIXME
  function (req, res) { res.send(501); });

/** @returns {error} 405 - not allowed
 *  @event PUT rest/projects/:id
 *  @memberof module:rest/projects */
app.put('/:id', function (req, res) { res.send(405); });

/** Delete a {@link module:models/project Project}
 *  @param {ObjectId} id ID of the project to fetch
 *  @returns 204 (w/ no content)
 *  @event DELETE rest/projects/:id
 *  @memberof module:rest/projects */
app.del('/:id',
  project.findById('params.id', { _id: 1, owner: 1 }),
  project.checkFound,
  flow.or(
    me.isOwnerOf('project'),
    me.isModerator),
  project.removeById('params.id'),
  utils.respondNoContent);

/** Build a {@link module:models/project Project}
 *  @param {ObjectId} id ID of the project to build
 *  @returns {object} Containers for each of the contexts
 *  @event POST rest/projects/:id/build
 *  @memberof module:rest/projects */
app.post('/:id/build',
  project.findById('params.id'),
  project.checkFound,
  project.pullContexts('params.environment'),
  // use docklet to find a docker to work with
  docklet.create(),
  docklet.model.findDock(),
  // build the docker images from the project!
  project.buildFullProject,
  project.model.save(),
  // req.data.imageIds are the new built images
  // FIXME: add harbourmaster!
  // use harbormaster to build containers to send back
  // return a success with connections to the new containers
  utils.code(201),
  function (req, res) { res.json(res.code, req.data.imageIds); });
